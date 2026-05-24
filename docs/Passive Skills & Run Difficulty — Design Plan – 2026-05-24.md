# Passive Skills & Run Difficulty — Design Plan

**Date:** 2026-05-24
**Status:** Brainstorm / design — not yet scheduled into a version.
**Scope:** Two new systems — (1) a **Passive Skills** layer (gold-bought, slot-gated, swappable gameplay-modifier relics, also rollable on gear) and (2) a **Run Configurator + Adaptive Difficulty Director**: the player chooses run **length** + **waves/stage** + a difficulty **mode** (Easy→Legendary) that *tugs* the Director, while the game **auto-tunes** the challenge to the player and **composes waves procedurally** for fresh, meaningful challenges (§12–§13 are the current direction).

---

## 1. Goals

- **Passives** = build-defining *gameplay modifiers* (not stat increments). Equip slots (3 baseline, scaling up to 5 by run length — §11.A), bought with account-gold like weapons/abilities, slot-gated over the run, **swappable mid-run from the menu**, and **also rollable on gear** (shared registry). They should *drastically change how the run plays* and **stack synergistically** in deliberate clusters.
- **Run shape + adaptive difficulty** = the player picks run **length** (stages), **waves/stage** (a commitment-for-reward dial, §12.3), and a **difficulty MODE** (Easy→Legendary, §13.2) that *tugs* the Director; the game then **auto-tunes** the challenge to the player within that mode and **composes each wave procedurally** (§12.4). Higher mode + deeper waves + stronger play → more drops + better rarity (§13.3).
- **Reconcile, don't duplicate.** Both features must fold cleanly into the already-shipped systems (account-gold unlocks, BUILD tree, 4-slot abilities, the element/status engine, the energy meter, the loot/rarity ladder, kill-streaks, SP stats) and into the still-unbuilt backlog (item traits C.I3, keystones C.I4, W8 Ascension).

---

## 2. Naming reconciliation (read first)

There are already two "passive" concepts in the codebase, and a third planned one:

| Existing concept | What it is | Where |
|---|---|---|
| `PASSIVE_UPGRADES` / `PASSIVE_REWARD_IDS` | **Stat increments** (CRIT, HEALTH, TOUGHNESS, VAMPIRISM, THORNS, DODGE, SPEED) gained as **wave-clear cards**, stackable | `weapon-data.js` |
| `SP_STATS` | The **same stat families**, allocated permanently with SP | `sp-stats.js` |
| Item **traits** (C.I3) + **keystones** (C.I4) | **Rule-changing modifiers** (Glass Cannon, Executioner, Echo, Momentum, …) — *unbuilt* | backlog only |

The requested "Passive Skills" are **rule-changers**, i.e. they are the same *kind* of thing as the planned item traits/keystones — **not** the same kind of thing as the stat "passives."

**Recommendation (naming):** Reserve the word **Passive** for the new rule-modifier layer (matches your wording: "passive slots / passive skills"), and rename the stat pool `PASSIVE_UPGRADES → STAT_UPGRADES` (user-facing "Stat boons"). This frees a clean namespace:

- **Stats** — numeric increments (SP allocation + wave-clear stat boons). *(rename only; no behavior change)*
- **Passives** — NEW. Rule-changing modifiers in 3 equip slots.

> *Fork:* if you'd rather avoid the `PASSIVE_UPGRADES→STAT_UPGRADES` rename churn, the alternative is to name the new layer **"Relics"** (or "Augments") and leave the stat code alone. Cleaner taxonomy vs. less churn. **Recommend the rename** — "Passives" is the word you used and it reads best in the UI.

---

## 3. The big reconciliation: Passives = the unified rule-modifier pool

The planned **C.I3 traits** and **C.I4 keystones** were meant to be a shared `ITEM_TRAITS` rule-modifier pool. The Passive Skills feature is best built as **that same pool**, acquired **two ways** — the equip slot (primary) and a roll on gear:

```
            ┌─────────────────────────────────────────┐
            │   PASSIVES  (one rule-modifier registry) │
            │   id · name · desc · hooks · downside     │
            │   tags (offense/defense/element/econ/…)   │
            └───────────────────┬───────────────────────┘
       equip slot (NEW)         │      top-tier item roll (C.I3, later)
   gold-bought, 3–5 slots,      │      modular passives on Exceptional+ gear;
   swappable mid-run            │      a keystone only on a Transcendental roll
```

**Consequence:** Phase C's C.I3a/b/c + C.I4 are **folded into the Passive phase** — one registry, one set of consumer hooks, **two ways to acquire** (equip slot + gear roll). *(Passives are deliberately NOT delivered via powerup cards — cards amplify weapons/abilities; passives are a separate, gold-bought layer. The old C.I4 "keystone card" channel is dropped.)*

**How passives differ from the neighbours (to keep them distinct):**

| Layer | Active? | Scope | Acquire | Persistence |
|---|---|---|---|---|
| **Abilities** (4 slots) | Active (keypress + cooldown) | self/area | gold unlock, run-locked loadout | per-run |
| **Mechanic mods** (Phase W) | Passive | **per-weapon** (pierce/explode/home) | gold unlock, run-locked | per-run, as powerup stacks |
| **Attunements** (Phase W) | Passive | **per-weapon** (elements) | gold unlock, run-locked | per-run |
| **SP stats** | Passive | global numbers | SP allocation | permanent |
| **Passives (NEW)** | Passive | **global rules** | gold unlock, **swappable mid-run** | per-run, slot-gated |

---

## 4. Passive Skills — system design

### 4.1 Slots & unlock-over-time
> **Superseded by §11.A** (round-3): slot *count* now scales with run length (3 at 10–29 stages → 5 at 60–100, soft cap **5**), with a **keystone budget of 2**, and gear adds *modular* passives on top. The original fixed-3 model is kept below for context.
- **Slot 1 from run start;** further slots unlock **progressively during the run**, up to `maxSlots(stages)` (§11.A) — evenly spaced across the stages so each unlock feels like a power beat.
- *(Original round-1 model, now folded into §11.A: 3 fixed slots, slot 2 & 3 at `ceil(stages × 0.3 / 0.6)` → stages 3 & 6 in a 10-stage run.)*

### 4.2 Acquisition (mirror abilities/weapons)
- New unlock category in `armory.js` `UNLOCK_CATEGORIES`:
  `passives: { metaKey: 'unlockedPassives', base: ['<1-2 starters>'], cost: ~9000 }` (priced between mods and abilities; tune in balance pass).
- Bought permanently with **account-gold** in the pre-run **BUILD tree** (new **PASSIVES cluster** alongside PRIMARY/POWER/DEFENSE/PASSIVE-stats/GEAR).
- Persisted in `rainboidsMeta.unlockedPassives` via the existing `loadMeta`/`saveMeta`.

### 4.3 Equip & **mid-run swap**
- Player state (mirrors the 4-slot ability model):
  `equippedPassives = [id, null, null]` · `ownedPassives: Set` · `passiveSlotsUnlocked = 1`.
- **Swappable any time from the pause menu** (your spec) — a "PASSIVES" panel reusing the loadout-row UI, choosing from `ownedPassives` (∩ this run's chosen pool) into any *unlocked* slot. This is the key difference from weapons/abilities (which lock at run start).
- **Anti-cheese for swap:** passives whose power *ramps* (stacks that build over time) **reset their accrued state on swap/equip**, so hot-swapping can't dodge a downside or instantly bank a ramp. Instant-effect passives just turn on/off. *(Fork: free swap vs. swap-only-at-stage-clear vs. short post-swap cooldown — **recommend free swap with ramp-reset**, honouring your "change at any time" intent.)*

### 4.4 Apply pipeline (how a passive actually does something)
A passive is a **flag + optional modifier contributions**, recomputed whenever slots change:
- `player.activePassives: Set<id>` rebuilt on equip/swap/slot-unlock.
- `player.hasPassive(id)` → boolean, queried at the relevant hook point.
- For numeric passives, a `getPassiveMod(key)` aggregator folds into the existing `getEffective*` getters exactly like SP/items already do (e.g. `getEffectiveCritDamage()` adds `getPassiveMod('critDamage')`).
- For rule-changers, consumers branch on `hasPassive(id)` at the natural site:
  - **fire path** (`weapons.js` createBullets / fireChargedShot / firePower)
  - **damage application** (`combat-manager.js applyDamageToEnemy`, the status helpers)
  - **drop path** (`dropOrbsFromEntity`)
  - **energy** (`player.update` regen / power fire)
  - **defense** (`lifecycle.js` damage-taken, dodge, thorns, lethal)
  - **kill-streak** (streak update)
- This is the **same registry pattern** mechanic mods already use — passives just aren't gated to one weapon.

---

## 5. Passive catalog (brainstorm)

> Legend: **⚡hook** = where it plugs in. **↯downside** where present (risk/reward). **⊕trait** marks ones that overlap a planned C.I3 trait → implement *once*, here.

### Offense / risk
| Passive | Effect | Synergy | Notes |
|---|---|---|---|
| **Glass Cannon** ⊕ | +60% all damage; −50% max HP | Dodge/shield passives, lifesteal, Second Heart | ⚡damage getter + max-HP getter; ↯ |
| **Berserker's Pact** | Damage scales as HP falls (up to +80% near death) | Glass Cannon, vampirism, the existing low-HP "desperation" drop curve | ⚡damage getter reads hp% |
| **Executioner** ⊕ | +200% vs enemies <25% HP; auto-kill trash <10% | Crit, VOID Mark, high fire rate | ⚡applyDamageToEnemy |
| **Hair Trigger** | +40% primary fire rate; each shot drains a sliver of energy (rate drops when empty) | Energy-regen passives, primary-focused builds | ⚡fire-rate getter + energy |

### Energy / power-weapon (hooks the just-reworked energy meter)
| Passive | Effect | Synergy | Notes |
|---|---|---|---|
| **Overflow Capacitor** | Energy regen ×2 and +50% max energy; power costs ×1.5 | Power attunements, Discharge, Twin Cast | ⚡energy regen + cost; net = more, bigger powers |
| **Discharge** | At full energy, auto-release a free nova and drop to 50% | Fast regen, AoE attunements, crowds | ⚡energy cap event |
| **Siphon Cells** | Landing hits refund a little energy (callback to the old per-hit gain) | High fire rate, multishot, Conductor | ⚡on-hit |

### Element / status (hooks the element + status engine)
| Passive | Effect | Synergy | Notes |
|---|---|---|---|
| **Catalyst** | Status **reactions** (shatter/flare/conduct) deal +100% and jump one extra time | Attunements, multi-element weapons, Prismatic Soul | ⚡reaction resolver |
| **Prismatic Soul** ⊕ | Your shots auto-cycle all 6 elements | Catalyst, reaction builds | ⚡bullet element stamp; pairs with W attunements |
| **Pyromania** | Burning enemies take +50% from all sources; burn spreads on death | PYRO attunement, oil, AoE | ⚡status + on-death |
| **Conductor** ⊕ | Hits link nearby enemies; 20% of damage bleeds to linked | VOLT, NOVA, crowds | ⚡damage propagation |
| **Cryoclasm** | Shatter triggers an AoE freeze burst (chain-freeze) | CRYO, Stasis/Cryo Field ability | ⚡shatter reaction |

### Tempo / movement (rewards the new "always-in-motion" ship feel)
| Passive | Effect | Synergy | Notes |
|---|---|---|---|
| **Slipstream** ⊕ (Momentum) | Moving builds stacking +dmg & +speed; standing still bleeds it | Speed passives, dodge, Streak builds | ⚡movement tick; resets on swap |
| **Killing Spree** | Kill-streak no longer resets on hit (decays slowly instead); streak dmg bonus ×2 | Everything streak; tanky/dodgy builds | ⚡streak update |
| **Adrenaline** ⊕ | Each kill briefly stacks fire rate + move speed | Fast clears, crowds | ⚡on-kill |
| **Phase Walker** | Dash recharges faster, longer i-frames, damaging after-image | Dash/Blink abilities | ⚡dash |

### Defense / sustain
| Passive | Effect | Synergy | Notes |
|---|---|---|---|
| **Reactive Plating** ⊕ | Taking a hit grants a brief shield + reflect burst | Thorns, tanky builds | ⚡damage-taken |
| **Second Heart** ⊕ | Survive lethal once per stage at 30% HP + i-frames | Glass Cannon, Berserker | ⚡lethal resolve; weaker-but-repeating vs. the Second Wind ability |
| **Leech Field** | Vampirism ×2; overheal becomes a temp shield | Vampirism SP/items, high DPS, Glass Cannon | ⚡vampirism + heal cap |
| **Hold the Line** | Not firing for 1.5s grants an absorbing shield | Hit-and-run, dodge | ⚡fire timer |

### Economy / loot (pairs with the difficulty loot scaling)
| Passive | Effect | Synergy | Notes |
|---|---|---|---|
| **Hoarder's Greed** ⊕ | +100% gold-find; gold orbs heal 1 HP; +15% damage taken | Kill-streak gold, Scavenger | ⚡drop/gold; ↯ |
| **Scavenger** ⊕ (Orb Magnet) | +50% item drop rate, huge pickup radius, +Cores on salvage | Difficulty loot scaling, gear builds | ⚡drop path |

### Wild / keystone (big swings, build-defining)
| Passive | Effect | Synergy | Notes |
|---|---|---|---|
| **Twin Cast** ⊕ (Echo) | Power weapons fire twice (2nd at 50%); abilities get +1 charge; energy cost +30% | Overflow Capacitor, power builds | ⚡power + ability cast |
| **Purist** | You can't crit, but +40% flat damage and shots pierce | Anti-crit identity | ⚡damage + bullet |
| **Gunslinger** | No power weapons/abilities; +50% primary dmg, +30% fire rate | Pure-gunner identity | ⚡disables power/ability slots |
| **One With The Void** | 5s without damage → partially phased (+40% dodge); breaks on hit | Dodge, hit-and-run | ⚡no-hit timer |

That's ~24 to seed from; ship a curated **first batch of ~10–12** (one strong pick per archetype), then expand. The `⊕` ones **replace** the duplicate C.I3 trait entries (built once, here).

### 5.1 Synergy clusters (the "stack meaningfully" payoff)
Designed so a full 3-slot set creates a distinct playstyle:

- **Glass Berserker** — Glass Cannon + Berserker's Pact + Second Heart → live at 1 HP for monstrous damage, cheat death each stage.
- **Reaction Mage** — Prismatic Soul + Catalyst + Pyromania (or Conductor/Cryoclasm) → every shot multi-elements, reactions detonate chains.
- **Power Battery** — Overflow Capacitor + Discharge + Twin Cast → near-constant double power weapons + auto-novas.
- **Streak Runner** — Killing Spree + Slipstream + Adrenaline → never stop moving, never lose the streak, snowball fire rate/speed/damage.
- **Greedy Vampire** — Hoarder's Greed + Leech Field + Scavenger → sustain through lifesteal, drown in gold/loot (best on high difficulty).

Note how clusters **cross-reference existing systems**: Reaction Mage leans on Phase W attunements; Power Battery on the new energy meter; Streak Runner on the kill-streak ladder; Greedy Vampire on SP vampirism + the difficulty loot multiplier.

---

## 6. Run Configurator & Difficulty Scaling

### 6.1 Run config object
Set at run start (in the BUILD → RUN SETUP flow), stored on `this.game.runConfig` and in the save for `CONTINUE`:

```
runConfig = {
  stages:        10,        // slider 10..30 (default 10; revised from 100 — §13.7) — also the BOSS count (1 boss / stage)
  wavesPerStage: 3,         // radio 3 | 6 | 9 (default 3)
  mode:          'NORMAL',  // Easy|Normal|Hard|Epic|Legendary — a BIAS on the Director (§13.2), NOT a fixed multiplier
}
// derived: totalWaves = stages × wavesPerStage (30..900)
//   within a stage (local wave 1..W): last wave = BOSS; other multiples of 3 = ELITE; rest = normal
//   POWERUP-CARD pick after every stage EXCEPT the last  →  cards = stages − 1 (99 for a 100-stage run)
```

This **replaces the hardcoded `MAX_WAVES = 30`** with `runConfig.stages × runConfig.wavesPerStage`. Enemy scaling becomes the Director's **absolute baseline** (§11.D / §12.4) so longer runs keep escalating instead of plateauing. `isBossWave`, the new **elite** schedule, the **powerup-card-per-stage** cadence, passive-slot unlocks, and the run-complete check (`currentWave >= totalWaves`) all read the config.

### 6.2 What difficulty scales
> **Superseded by §12.4** — difficulty is **auto-tuned, not chosen**. The table below is kept as the *scaling reference* (which knobs exist, rough magnitudes); the Director now drives them off **achieved** threat + player performance instead of a chosen tier `D`.

Difficulty tier `D` (1 = baseline) applies multipliers **on top of** the existing wave curve and the existing bonuses (boss bias, LUCKY_DROPS, kill-streak gold), respecting current caps:

| Knob | Formula (proposal) | At D=5 | At D=10 | Hook |
|---|---|---|---|---|
| Enemy HP & damage | ×(1 + (D−1)·0.12) | ×1.48 | ×2.08 | `getLevelScaledEnemyStats` / enemy dmg |
| Enemy density/spawn | ×(1 + (D−1)·0.06) | ×1.24 | ×1.54 | wave spawn counts |
| **Item drop rate** | ×(1 + (D−1)·0.10) | ×1.40 | ×1.90 | `dropOrbsFromEntity` hp/tough/trink rates |
| **Item rarity bias** | bias = (D−1)·0.06 | 0.24 | 0.54 | `rollRarity(bias)` (tilts toward rare+) |
| Health/money drop rate | ×(1 + (D−1)·0.08) | ×1.32 | ×1.72 | `dropOrbsFromEntity` (caps still clamp) |
| Gold-find | ×(1 + (D−1)·0.10) | ×1.40 | ×1.90 | gold budget |
| Account-gold bank bonus | ×(1 + (D−1)·0.08) | ×1.32 | ×1.72 | run-end bank |

Net: **higher difficulty = harder enemies but markedly more + better loot and gold** — exactly the risk/reward you asked for. All numbers are starting points for a balance pass.

### 6.3 Cadence & slot-unlock scaling
- **Powerup-card pick: every stage clear *except the last*** → cards = stages − 1 (see §12.2 for keeping all ~99 picks meaningful).
- **Elite (miniboss): every 3rd wave** that isn't the stage boss (§11.B).
- **Passive slot unlocks:** progressive across the run, up to `maxSlots(stages)` (§11.A).
- **XP/level** (meta) accrues per wave-clear — more waves = more meta XP, naturally.

### 6.4 RUN SETUP UI
A small pre-run screen (or a panel folded into the BUILD → START flow): **Stages** slider (10–30; §13.7) + **Waves/stage** radio (3/6/9) + **Mode** selector (Easy/Normal/Hard/Epic/Legendary — Epic & Legendary gated, §13.2), plus a **live readout** of the resulting **reward dial** (§13.3 — e.g. "Legendary × 9 waves/stage → loot ×~3.5; Transcendental possible deep in") **and the player's current PWR** (§13.4–13.5). The Director still auto-tunes *within* the chosen mode. `START RUN` writes `runConfig` and proceeds.

### 6.5 Reconciliation
- **Absorbs W8 "Ascension."** W8 described "escalating endless difficulty after first clear: enemy HP/dmg/density + rising resistances; higher item-level gear + more gold." That **is** this difficulty system. Recommend: difficulty tiers above your first clear *are* Ascension; mark W8's Ascension bullet as folded into this phase. (Marathon length — up to 100 stages — + rising resistances at the top tiers carry the Ascension fantasy without a separate endless mode.)
- **Mobile scaling** already multiplies wave configs separately — keep it as an independent platform factor layered under `difficulty`.
- **Gating:** optionally lock higher difficulty tiers behind clearing lower ones (classic ascension unlock), stored in `rainboidsMeta.maxDifficultyCleared`. *(Fork: gate tiers vs. all-open. Recommend gating — gives a progression spine.)*

---

## 7. Implementation outline (→ Plans.md Phase P & Phase X)

**Phase P — Passive Skills**
1. **P1** Registry + reconciliation: rename `PASSIVE_UPGRADES→STAT_UPGRADES`; new `PASSIVES` registry (`passive-data.js`) with hook metadata; `passives` unlock category + meta key; fold C.I3/C.I4 plan into this pool.
2. **P2** Player state + apply pipeline: `equippedPassives[]` (length = `maxSlots`, up to 5), `ownedPassives`, `activePassives` Set, `hasPassive`, `getPassiveMod`, keystone-budget enforcement (≤2); slot-unlock state.
3. **P3** Slot gating: `maxSlots = 3 + floor((stages−10)/10)` (cap 5; §13.7); unlock slots progressively at stage milestones (wave-clear hook).
4. **P4** BUILD-tree PASSIVES cluster (unlock + the run's chosen pool) + loadout carry.
5. **P5** In-run swap menu (pause panel) + ramp-reset-on-swap.
6. **P6** Catalog batch 1 (~10–12 passives, one per archetype) — each with a live consumer + unit test.
7. **P7** Second delivery channel: **top-tier item rolls** (old C.I3) draw modular passives (Exceptional+) / a keystone (Transcendental) from the same pool. *(No card-based passive delivery — passives aren't powerup cards.)*

**Phase X — Run Configurator, procedural waves & adaptive difficulty** *(updated round-4, §12)*
1. **X1** `runConfig = {stages, wavesPerStage}` (no `difficulty`); replace `MAX_WAVES` with `stages×wavesPerStage`; boss + elite schedule + powerup-card-per-stage (cards = stages − 1) + run-complete read the config.
2. **X2** **Procedural wave composer** (§12.4b): a threat budget → randomized enemy roster + wave themes + telegraphed modifiers; replaces the looping `WAVE_DATA[1..30]` past wave 30.
3. **X3** **Adaptive Difficulty Director** (§12.4a): performance signals → challenge index → rate-limited enemy HP/dmg/toughness/resist/density knobs, an absolute upward baseline, and player-power awareness (cards/passives/gear).
4. **X4** Reward off *achieved* threat × performance: drop-rate, `rollRarity` ceiling+bias, item-level, gold; run-shape reward multipliers (§12.3); **peak-threat** meta stat.
5. **X5** RUN SETUP UI — length + waves/stage + **mode** selector (Easy→Legendary, Epic/Legendary gated, §13.2) + **reward + PWR** readout; persist for CONTINUE; HUD **PWR vs. THREAT** meter (§13.5).
6. **X6** `CARDS_PER_RUN` derived (`stages − 1`); ensure the amplifier pool sustains the max stage count — deepen the pool and/or cap the stage slider to the loadout's card count (§12.2).
7. **X7** Balance pass: AI-survival across short/long × weak/strong profiles; verify the Director holds the target HP band and a 99-card late game stays lethal.

---

## 8. Open forks for sign-off (recommendations in **bold**)

1. **Naming** — rename stat `PASSIVE_UPGRADES→STAT_UPGRADES` and call the new layer **"Passives"** *(recommended)*, vs. name the new layer "Relics" and leave stat code alone.
2. **Unify with traits/keystones** — fold C.I3/C.I4 into the passive pool as alternate delivery channels *(recommended)*, vs. keep item traits a separate item-bound system.
3. **Mid-run swap** — **free swap with ramp-reset** *(recommended)* vs. swap-only-at-stage-clear vs. post-swap cooldown.
4. **Slot-unlock timing** — **fractional (`ceil(stages·0.3/0.6)`)** *(recommended)* vs. absolute stages 3 & 6.
5. **Difficulty tiers** — **gated (clear-to-unlock, = Ascension)** *(recommended)* vs. all-open from the start.
6. **Run-length bounds & default** — proposed stages 3–20 (default 10), waves/stage 2–5 (default 3); confirm or adjust.

---

## 9. Round-2 decisions (2026-05-24)

Confirmed by product owner:

1. **Naming — stats are "Stats," full stop.** Rename `PASSIVE_UPGRADES → STATS` and `PASSIVE_REWARD_IDS → STAT_CARD_IDS` (drop *both* "passive" and "upgrade"; SP_STATS keeps its name as the SP-allocation defs — the two reference the same stat families). User-facing label: **STATS**. "Passives" now exclusively means the rule-modifier layer.
2. **Shared registry across items AND passive slots — confirmed.** One `PASSIVES` registry; an entry declares where it can live (slot / item / both). Players can **roll items that carry passive skills** (a passive-affix on higher-tier gear). See §10 for the expanded catalog + delivery/stacking rules.
3. **Mid-run swap — confirmed** (free swap, ramp-reset on swap).
4. **Slots scale with run length** (capped — §11.A) — *no endless*; stages 10–30 with a definite end (§11.B; revised from 100 in §13.7).
5. **Difficulty tiers gated, reward-feeling** — design in §11.C.
6. **Waves/stage = radio 3/6/9 (default 3)**, stages = slider 10–30 (§13.7); elite every 3rd wave, boss + card every stage (§11.B); scaling §11.D; long-run reconciliations §11.E; **mid-run loadout access** §11.F.

> **Round-3 (2026-05-24):** §10.1 adds 7 keystones + 9 modular passives; §11.A answers the "max passives" question (slots cap **5** + keystone budget **2**, gear adds modular); §11.B finalizes the run structure (no endless). These supersede the round-1 §8 forks and the round-2 notes above where they differ.

> **Round-4 (2026-05-24) — see §12:** terminology unified to **"powerup cards"** (one card type — passives are NOT cards); **cards = stages − 1** (99 for a 100-stage run), bounded by the amplifier pool (§12.2); **reward bonuses** for waves/stage + stages (§12.3); and the pivot to an **Adaptive Difficulty Director + procedural wave composer** that auto-tune and randomize the challenge (§12.4). Supersedes §8 #5, §9 #5, §6.2's chosen-tier table, and §11.C's tier-gating.

> **Round-5 (2026-05-24) — see §13, the current direction:** deepen the powerup-card pool via a **global amplifier pool** so shallow loadouts reach 99 picks *without* mono-weapon cheese (§13.1); the player **tugs** the Director with a **difficulty MODE — Easy/Normal/Hard/Epic/Legendary** (gated; §13.2) — so difficulty *is* chosen, but as a bias on the adaptive system, not a fixed table; **rewards scale with mode × depth × performance** (better loot at wave 99 than wave 9; Transcendental only on Legendary, deep; §13.3); and a **Power Level (PWR)** metric drives the Director's pre-load and is **shown to the player** (§13.4–13.5). `runConfig` gains `mode`.

> **Round-6 (2026-05-24) — see §13.6–§13.7:** **max stages revised 100 → 30** (≈29 powerup cards) so every card is meaningful with no new content; the 100-stage marathon + the global amplifier pool become a later stretch. Slot scaling rebased: `maxSlots = 3 + floor((stages−10)/10)` cap 5 → 10:3 / 20:4 / 30:5. **UI:** the HUD shield badge → **PWR** (it currently shows level); **player level stays on the stats screen** (already shown there — no change). Supersedes the "10–100 / 99-card" figures in §11.B/§12 prose.

> **Round-7 (2026-05-24) — locks + algorithm pass:** max stages **= 30** (slider 10–30) confirmed; the HUD shield badge shows **"P"** (single letter — "PWR" won't fit) + the power-level number beside it (§13.6); and **§14 — Algorithm specifications** adds implementation-ready math for **PWR** (§14.1), the **Director control loop** (§14.2), the **wave composer / threat budget** (§14.3), **reward scaling** (§14.4), the **enemy baseline curve** (§14.5), a **constants table** (§14.6), and **mode-unlock gating** (§14.7). §14 is authoritative for all formulas.

---

## 10. Expanded passive catalog — shared item + slot registry

**Registry entry gains delivery metadata:**
```
{ id, name, desc, hooks, tags,
  slot:  true|false,        // can be equipped in a passive slot
  item:  true|false,        // can roll as a passive-affix on gear
  itemTierMin: 'exceptional'|'legendary'|'transcendental',  // gear rarity gate
  stack: 'binary'|'additive',  // how it behaves if present from >1 source
  downside?: '…' }
```

**Stacking rule:** `binary` passives (rule rewrites) are simply *on* if present from any source — slotting + an item roll gives no double benefit (but frees a slot). `additive` passives sum their magnitude across sources, each with its own soft cap. Build-defining keystones are `slot`-only or gated to **Transcendental** gear as a chase roll; small modular passives roll on Exceptional+.

### Keystones — slot-only (or Transcendental chase roll). Binary, build-defining.
| Passive | Effect | ↯ Downside | Synergy |
|---|---|---|---|
| **Glass Cannon** | +60% damage | −50% max HP | dodge/shield passives, lifesteal, Second Heart |
| **Berserker's Pact** | damage ramps as HP falls (→ +80%) | — (you must stay low) | Glass Cannon, vampirism, desperation drops |
| **Gunslinger** | +50% primary dmg, +30% fire rate | no power weapons / abilities | primary builds, Hair Trigger |
| **Purist** | +40% flat damage, shots pierce | cannot crit | anti-crit identity, Opportunist |
| **Twin Cast** | powers fire twice (2nd @50%), abilities +1 charge | energy cost +30% | Overflow Capacitor, Discharge |
| **Prismatic Soul** | shots auto-cycle all 6 elements | — | Catalyst, reaction builds, attunements |
| **Overflow Capacitor** | 2× energy regen, +50% max energy | powers cost ×1.5 | Discharge, Twin Cast, power attunements |
| **Killing Spree** | streak never resets on hit (slow decay), ×2 streak dmg | — | Slipstream, Adrenaline, tanky/dodgy builds |
| **One With The Void** | 5s no-hit → +40% dodge (phased) | breaks on hit | dodge, hit-and-run, movement |
| **Second Heart** | survive lethal once per stage @30% HP + i-frames | — | Glass Cannon, Berserker |

### Modular passives — item + slot. Mostly additive, safe to stack.
| Passive | Effect | Deliver | Synergy |
|---|---|---|---|
| **Catalyst** | status reactions +50%/source & spread +1 | both | Prismatic Soul, attunements |
| **Frostbite** | chill/freeze builds 25% faster | both (Exc+) | CRYO, Cryoclasm |
| **Hex Touch** | +20% status-tick damage (burn/corrode/bleed) | both (Exc+) | Pyromania, Toxic |
| **Kindling** | burn/corrode spreads to +1 enemy | both | PYRO/TOXIC, crowds |
| **Static Charge** | every 5th hit emits a small conduct zap | both | VOLT, Conductor |
| **Opportunist** | +15% damage vs status-afflicted enemies | both | any element build |
| **Predator** | first hit on a full-HP enemy always crits | both | crit builds, burst |
| **Vampiric Rounds** | crits heal 2 HP | both (Exc+) | crit, Leech Field |
| **Ricochet** | killing a foe bounces the shot to a new target | both | crowds, fast clears |
| **Momentum Rounds** | bullets gain damage the farther they fly | both | LONG_RANGE mod, Rail Driver |
| **Chain Reaction** | explosive kills +50% radius | both | EXPLOSIVE mod, crowds |
| **Kinetic Battery** | dashing refunds energy | both | dash abilities, power builds |
| **Overflow Spark** | at full energy, primaries +25% damage | both | energy management, Overflow Capacitor |
| **Last Bastion** | below 30% HP, +20% dodge | both | Berserker, Glass Cannon |
| **Guardian Echo** | lethal-threshold hit emits a knockback nova (no death-save) | both | defense, crowds |
| **Salvage Protocol** | +1 Core per salvage; +tier-up chance on drops | item-only (econ) | gear/Cores builds |
| **Scavenger** | +50% item drop rate, huge pickup radius | slot (econ) | high difficulty loot |
| **Hoarder's Greed** | +100% gold-find; gold orbs heal 1 HP | slot | +15% dmg taken ↯; kill-streak gold |

Modular passives are the natural **item-affix** pool (they're additive and don't rewrite rules), so rolling them on gear feels like loot, not like accidentally bricking a build. Keystones stay slot-only (or a Transcendental "build-enabling" chase roll) so you never roll *"can't crit"* on a helmet by accident.

### 10.1 More passives — round 3 (self-reviewed for "interesting, not cheap")

Filtered hard: every entry below either creates a new *decision*, a new *playstyle*, or a new *synergy axis*. No stat-sticks (those are Stats), no "+X% damage" filler.

**New keystones (slot-only — build-defining):**
| Passive | Effect | ↯ Downside | Synergy / why it's interesting |
|---|---|---|---|
| **Eye of the Storm** | While **stationary**, nearby enemies + their projectiles slow 40% (a "plant & delete" stance); moving cancels it | you're a sitting target | Rail Driver / Lance / charge, **Siege**; the anti-thesis of movement builds — a whole different way to play |
| **Detonator** | Killing a status-afflicted enemy **detonates its statuses as an AoE** (burn→fire nova, freeze→frost nova, corrode→acid pool) | — | Catalyst, Kindling, attunements, Prismatic Soul — turns kills into chain reactions; the cornerstone of a status build |
| **Frenzy** | +8% damage per nearby enemy (cap +80%) | +30% damage taken | AoE, lifesteal, dodge — rewards diving *into* crowds instead of kiting |
| **Gravity Well** | A constant weak pull draws enemies toward your **reticle**, grouping them | pulls danger toward you | VOID, Nova/AoE, Detonator — you *reshape the battlefield* into a kill-box |
| **Flow State** | Each kill cuts **all ability cooldowns** by 3% | — | low-cooldown abilities, fast clears — enables an ability-spam playstyle |
| **Failsafe** | No single hit can remove more than **50% of max HP** | −15% max HP | the anti-one-shot pick for high difficulty; pairs with Glass Cannon to cap its fragility spikes |
| **Heat Sink** *(feel-test; cut if fiddly)* | Primaries ignore their fire-rate cap and **ramp continuously while held, building HEAT**; at max heat you VENT (brief lockout + AoE burst) | lockout if you over-hold | explosive/crowd builds; converts "hold to win" into a burst-rhythm minigame |

**New modular passives (item + slot — additive, loot-safe):**
| Passive | Effect | Synergy / why it's interesting |
|---|---|---|
| **Overkill** | Excess damage from a kill **splashes to the nearest enemy** | burst/crit + single-target weapons; rewards over-killing |
| **Vendetta** | The last enemy to damage you takes **+30% from you until it dies** (a rival mark) | adds a target-priority decision; Mark/VOID |
| **Conduit** | Your statuses tick **25% faster but expire 25% sooner** (front-loaded) | Hex Touch, Detonator, fast clears — changes status *pacing* |
| **Afterimage** | Dashing leaves a **clone that fires your primary once** | dash abilities, Phase Walker |
| **Resonance** | **Every 3rd power-weapon use costs no energy** | power builds, Overflow Capacitor, Twin Cast — energy economy |
| **Backlash** | When you **dodge** (evasion proc), fire a retaliating shot at the attacker | DODGE SP, Last Bastion, One With The Void — makes dodge offensive |
| **Harvest** | Enemies killed by **status damage** (not direct) drop bonus energy + gold | status/element builds, Detonator — rewards a *kill style* |
| **Tracer Lock** | Repeated hits on the **same target** ramp damage to it (resets on swap) | Rail/Lance, focus-fire — focus-vs-spread decision |
| **Siege** | Standing **still** ramps damage (stacks, decays on move) | the stationary counter to Slipstream; pairs with **Eye of the Storm** for a turret build |

That's **+7 keystones and +9 modular** on top of §10, so the shared registry is ~40 passives — plenty to curate a strong launch batch from (build *one* per archetype first; the rest are content drops).

---

## 11. Run length, slots, difficulty & loadout

### A. How many passives? (slot cap + gear) — the estimation question

Passives come from **two sources**, so "max passives" is really "how many *equipped slots*, given gear *also* grants passives?"

**Recommendation — equipped slots cap at 5; gear rolls modular passives only; a keystone budget of 2.**

- **Max equipped slots scales with run length** — rebased to the 10–30 range (§13.7): `maxSlots = 3 + floor((stages − 10) / 10)`, capped at **5**:

  | stages | 10–19 | 20–29 | 30 |
  |---|---|---|---|
  | **max slots** | 3 | 4 | 5 |

  Slots unlock **progressively** across the run (slot 1 at start; the rest at evenly-spaced stage milestones), so "more stages → more passives" holds and a long run *feels* like a power ramp — but it tops out at 5.
- **Keystone budget = 2.** At most 2 equipped slots may hold **keystones** (build-rewriting); the rest take **modular** passives. Start conservative — loosening this after playtest is trivial; clawing back an OP launch is not.
- **Gear rolls MODULAR passives only** (Exceptional+ rolls one; Transcendental may *rarely* roll a keystone as a chase payoff that doesn't count against the budget). Across 5 gear slots that's up to ~5 more modular passives — realistically 2–3.
- **Net maximum simultaneous: ~5 slots + ~5 gear ≈ up to ~10 passives, but only ~2 keystones** (plus a rare Transcendental keystone). Rich and layered, with no degenerate "all-keystones" state.

**Why this is *lower* than the 6–8 we floated earlier:** now that **gear also supplies passives**, the slot cap must come down to keep the *total* in check — the "more passives" fantasy is delivered partly by loot, not slots alone. And you're right that passives are unproven: shipping **tight (5 slots / 2 keystones)** and loosening from playtest data is the safe path. The backstop that keeps even a maxed build honest is the **unbounded enemy scaling** (§D) — the longer/harder the run, the more the threat outpaces your stacked passives.

### B. Run length & structure (no endless — long, but it ends)

- **Stages: a slider, 10 → 30** (default **10**; revised down from 100 — §13.7). **No endless mode.** The longest run is 30 stages with a definite finish + completion payoff. (A 100-stage marathon is a later stretch, once the global amplifier pool exists.)
- **Waves per stage: a radio — 3 / 6 / 9** (multiples of three; default **3**).
- **Intra-stage rhythm** — within a stage of `W` waves, the **last wave is the BOSS**, and every *other* multiple-of-3 wave is a guaranteed **ELITE (miniboss)**:

  | waves/stage | layout |
  |---|---|
  | **3** | normal · normal · **BOSS** *(no elite)* |
  | **6** | n · n · **ELITE** · n · n · **BOSS** |
  | **9** | n · n · **ELITE** · n · n · **ELITE** · n · n · **BOSS** |

- **Every stage ends with a boss, and every stage clear *except the last* grants a POWERUP CARD** — that's what gives stage completion a concrete meaning. So **cards = stages − 1** (99 for a 100-stage run; §12.2), bosses = stages, elites = `stages × (W/3 − 1)`.
- **Total waves = stages × W → 30 (10×3) up to 900 (100×9).** Length is itself a challenge axis (the absolute baseline in §D climbs the whole way), and the **Adaptive Difficulty Director** (§12.4) tunes the threat to the player the whole run. A 100-stage / 9-wave run is the ultimate gauntlet — brutal, multi-hour, but beatable and finite.

This supersedes the old "card every 2nd stage" cadence (§6.3 → now a **powerup card every stage but the last**) and the old "elite at mid-stage" idea (old §E → now **elite every 3rd wave**).

### C. Difficulty gating (reward-feeling, low-friction)
> **Superseded by §12.4 / refined by §13.2** — difficulty is no longer a fixed-multiplier tier. It's a **mode** (Easy→Legendary) that biases the Director, and **Epic/Legendary *are* gated** (`maxModeCleared`, §13.2) — so the "prove yourself to unlock" reward feel below survives. The rarity-ceiling idea is retained but keys off **mode × depth × achieved threat** (§13.3). Kept for context.
- **Unlock tier D+1 by reaching a milestone at tier D — not a full clear.** Proposal: *clear at least 5 stages at tier D in a single run* (even in a longer run — you don't have to finish it). Easy enough to reach in a session, but you must prove you can sustain that tier. New tiers feel earned, not grindy.
- **Tougher tiers pay out better — the loot-system change:** each tier raises a **rarity ceiling** (low tiers literally *cannot* roll Divine/Transcendental; the top tiers are the only place the best gear exists), plus higher **item level** (affix magnitude), **drop rate**, and **gold**. This makes climbing difficulty the *only* path to best-in-slot gear — a strong, self-reinforcing pull. (Implementation: `rollRarity` gains a `rarityCeiling`/`floor` from the tier, alongside the existing bias; `createItem` level term scales with tier.)
- Stored in `rainboidsMeta.maxDifficultyCleared`; locked tiers shown greyed with their unlock condition.

### D. Enemy scaling (difficulty × absolute progress)
- **Switch from run-normalized to absolute wave growth** so long runs genuinely escalate. Today's
  curve normalizes on `t=(w−1)/(N−1)` (≈15× HP at the wave-30 finale, but *plateaus* — a 100-wave run
  is no harder at the end). Replace with a monotonic absolute curve:
  `enemyHpDmgMult(wave, D) = base(wave) × (1 + (D−1) × 0.12)`, where `base(wave)` is **tuned so wave ≈30
  matches today's finale (~15×), then keeps climbing unbounded** (e.g. continue the existing
  `1 + a·w + b·w^1.5` shape with `w` = absolute wave, no `/N` normalization). density/count grows on a
  gentler curve. **Speeds are capped** (bullet/enemy speed clamps) so escalation comes from HP / count /
  damage / *new behaviors*, never from making projectiles physically undodgeable.
- **High-tier "rising resistance"** (top difficulty tiers / deep into a long run): enemies globally adapt resistance to your most-used element (a Warden-like meta pressure), nudging multi-element / coverage builds — this is the §15.4 Ascension idea, folded in.

### E. Long-run reconciliations (boss variety + card stacking)
*(Stage size & pacing is now defined in §B — waves/stage 3/6/9, elite every 3rd wave, boss + card every stage. The open problems a 100-stage run creates:)*
- **Boss variety.** A max run has up to **100 bosses** but only ~10 unique are planned (Phase D). Reuse the 10 **cyclically with escalating scale**, and at higher difficulty tiers **"elite-ify"** them (extra phase / affix / rising resist) so repeats stay fresh. **Elites (minibosses)** are cheap variety — elite-ified versions of normal enemy types (buffed HP + one affix), no new art needed.
- **Powerup-card pool ceiling** (detail §12.2). A 99-card run needs ~99 meaningful amplifier picks, near the ~70–140 a full loadout yields — so either **deepen the amplifier pool** to reliably hit ≥99 or **cap the stage slider** to the loadout's card count. *(Earlier drafts floated "passive/economy fallback cards" — dropped; passives aren't cards.)*

### F. Mid-run loadout access (the key call)
- **Recommendation — tiered commitment, auto-scaling with run length:**
  - **Passives:** swap **anytime** (already decided).
  - **Gear / inventory (items):** re-equip **anytime** — it's defensive/stat, low cheese risk, and lets collected loot matter immediately.
  - **Weapons / abilities / attunements:** re-build only at **stage-boss "Refit" checkpoints** (the screen that already pauses at stage clear). Within a stage you're committed.
- **Why this beats both extremes:** fully-free anytime swapping lets you hard-counter every single wave (swap to the perfect element/weapon each fight), which erases build identity and the roguelite tension. Locking everything for a 100-wave run feels awful because you collect mountains of loot you can't use. **Checkpoint-refit threads it:** you adapt to what you've earned between stages, but commit within a stage.
- **It auto-answers "when to allow vs. lock"** with no special rule: a **short punishing run has few checkpoints** (you're mostly stuck with your build — the punishment you asked for), while a **long gauntlet has many** (you naturally re-tool as you go). Difficulty + length *is* the commitment dial.
- *If you'd rather minimize friction:* the fallback is "gear + passives anytime, weapons/abilities/attunements also anytime" — fully free. Viable, but I'd hold the line at checkpoint-refit for offense to keep builds meaningful.

---

## 12. Round-4 redesign (2026-05-24): powerup cards, run bonuses & adaptive difficulty

> This round makes a **major pivot**: difficulty is **no longer player-chosen** — the game **auto-tunes** it and **evolves with the player**, while a procedural composer keeps every wave **fresh and random**. The overarching goal is **interesting, meaningful challenges**. This **supersedes** the player-chosen difficulty model wherever it differs (§6.2 multiplier table, §6.4 difficulty selector, §11.C tier-gating, the chosen-tier framing in §11.B/§11.D, and the `difficulty` field in `runConfig`).

### 12.1 Terminology — there is one card: the "powerup card"
The run-reward cards have been called *efficacy cards*, *draft cards*, and *survivor cards* — these are **all the same one thing**. Canonical term: **powerup cards** (the event is a **powerup-card pick**). There are **no sub-types** — a powerup card amplifies an equipped weapon/ability (the "1 primary + 1 power + 2 ability" offer that already exists). (Code module stays `card-draft.js`.)
- **Passives are NOT cards.** They're gold-bought, slot-equipped, and gear-rollable (§3, §4). Don't confuse the two.

### 12.2 One powerup card per stage; cards = stages − 1; the pool ceiling
- The player gets **one powerup-card pick at the end of every stage *except the last*** (the final stage's boss is the run's victory — no "next stage" to prepare for). So **cards = stages − 1**: 100 stages → **99** cards; 10 stages → 9.
- **The real constraint (your "limit stages to the cards you can get" rule):** a powerup card amplifies an equipped weapon/ability and has a `maxStacks` cap, so a full 4+4+4 loadout yields a **finite ~70–140 meaningful picks** (a *focused* loadout far fewer). **Resolved in §13.7: max stages = 30 (≈29 cards) for v1** — comfortably inside even a thin loadout's pool, so every card is meaningful with no new content. The 100-stage marathon is a later stretch that needs the **global amplifier pool** (§13.1, §13.7).
  - **(Most literal) Dynamic slider cap** = the chosen loadout's available powerup-card count, so a deep loadout unlocks all 100 stages and a shallow one caps lower.
- **No passive/economy "fallback cards"** — that was a wrong turn; passives aren't cards and Cores/gold aren't cards.
- *Implementation:* `CARDS_PER_RUN` (fixed `5`) becomes derived (`stages − 1`); the pool-ceiling decision above is the only wrinkle — no new card types.

### 12.3 Bonuses for waves/stage and stages (the reward dial)
Because difficulty is auto-tuned (§12.4), the player's run-shape choices are a **commitment-for-reward dial**, not a difficulty dial:
- **More waves/stage** = more enemies + elites before each powerup card (more grind per reward) → a per-stage **reward multiplier** on loot drop-rate, gold, rarity bias, and Cores:

  | waves/stage | reward × | elites / stage |
  |---|---|---|
  | 3 | ×1.0 | 0 |
  | 6 | ×1.3 | 1 |
  | 9 | ×1.6 | 2 |

  (Elites already drop better loot, so 9-wave stages **compound**: more elites × the multiplier.)
- **More stages** = a longer commitment → an **endurance curve**: the rarity **ceiling**, item **level**, and per-stage gold rise with the stage number reached, so the **best gear lives deep**. (This replaces the old "rarity ceiling gated by chosen difficulty tier" — now gated by *depth + achieved threat*, §12.4.)
- Net: 9 waves/stage × 100 stages is the grindiest, highest-reward shape; 3 × 10 is a quick low-reward sprint. Both are legitimate — difficulty self-adjusts either way.

### 12.4 Adaptive Difficulty Director + procedural wave composer
**The player does not pick a fixed difficulty number — they pick a *mode* that tugs the Director** (Easy → Legendary; §13.2). A per-run **Director** then auto-tunes the challenge to the player *within that mode* and ramps as they grow; a **procedural composer** keeps every wave fresh and randomized.

**Why the current systems can't do this (and can't reach wave 900):** waves are hardcoded tables `WAVE_DATA[1..30]`, and `getWaveConfig` *loops* past wave 30; enemy stats normalize over `MAX_WAVES` and cap at `ENEMY_LEVEL_MAX = MAX_WAVES + 15`. A 900-wave run would replay waves 1–30's compositions against a capped curve — trivially easy for a 99-card player. Both pieces must become **generative + adaptive**.

**(a) Adaptive Difficulty Director** — a controller that watches the player and steers the challenge:
- **Signals** (rolling window, updated each wave): damage taken ÷ max HP, time-to-clear vs. expected, player DPS / overkill ratio, HP% at wave end, near-death / revive / Second-Heart triggers, dodge & ability usage.
- **Challenge index:** fold the signals into one 0–1 "pressure" reading vs. a **target band** (e.g. the player *should* end most waves at ~40–70% HP within an expected time). Above band → too easy; below → too punishing.
- **Knobs it tunes** (rate-limited & smoothed — never swings violently): enemy **HP**, **damage**, **toughness** (armor/DR), **resistance** (drifts toward the player's most-used element — Warden-like), **density/count**, **aggression** (fire rate). *Speeds stay clamped* so nothing becomes physically undodgeable — escalation comes from HP / count / damage / toughness / resist / behavior.
- **Loop & feel:** ramp **up** when the player dominates (fast clears, full HP); ease **down** gently when they're drowning (anti-death-spiral). A slow **upward baseline** rides underneath so a long run always trends harder — no comfortable farm plateau.
- **Player-power awareness:** the baseline reads proxies for player strength (**powerup-card count, equipped passives/keystones, gear item-level**) and *pre-loads* threat for a stacked build instead of waiting to observe a stomp. **This is what keeps a 99-card late game lethal** — the answer to "is our scaling capable of handling that?" is *the scaling is relative to the player, so yes*.

**(b) Procedural wave composer** — decides *what* shows up, fresh each time:
- The Director hands the composer a **threat budget** per wave (scales with the Director's current level). The composer **spends** it on a randomized roster (cheap grunts ↔ expensive elites/specialists) + optional **wave modifiers** — so aggregate difficulty is *tuned* while the exact contents are *never the same twice*.
- **Wave themes** (weighted random): swarm · artillery/ranged · armored/shielded · elemental-surge (one element dominant → rewards the right coverage) · ambush/reinforcements · mixed. The theme biases the roster.
- **Wave modifiers** (roguelite affixes, optional per wave, **telegraphed up front** so they read as a puzzle not a gotcha): *enemies explode on death · fast-but-fragile · no health drops this wave · fog · shielded-until-you-kill-the-anchor · bounty (an elite drops extra loot)*. These are the engine of "interesting, meaningful challenge."
- **Elites & bosses** draw from the same budget logic — an elite is a budget-expensive entry; the stage boss is fixed at the stage end, scaled by the Director.

**(c) Reward keys off *achieved* difficulty, not a chosen tier:**
- Loot drop-rate, **rarity ceiling**, item level, and gold scale with **mode × depth × achieved threat × performance** (flawless / fast clears pay more) — full breakdown in **§13.3**. Performing well → the Director ramps → better loot, so the "harder = better loot" promise holds. Top rarities (Divine/Transcendental) appear only at high mode, deep in a run.
- **Meta:** track **peak threat reached** (and per-run-shape bests) as the bragging-rights / leaderboard stat the old "max difficulty cleared" used to provide.

**What this removes/changes:**
- The old fixed-multiplier `runConfig.difficulty` tier is gone; `runConfig = { stages, wavesPerStage, mode }`, where **`mode` biases the Director** (§13.2) rather than applying a static table.
- §6.2's fixed multiplier table, §11.C's tier-gating + `maxDifficultyCleared`, and the §6.4 RUN-SETUP "difficulty selector" are **superseded**. RUN SETUP now sets only **length + waves/stage**, and its live readout shows the **reward dial** (§12.3), not a difficulty number.
- §11.D's absolute unbounded curve **survives as the Director's baseline**; the player-relative correction rides on top.

**Open feel-questions (balance pass, non-blocking):** target HP-band width; how hard the upward baseline climbs vs. the adaptive correction; whether to surface a HUD **threat meter** (recommended — players should *feel* the escalation and know loot is scaling); wave-modifier frequency (every wave vs. ramping with depth).

---

## 13. Round-5 (2026-05-24): difficulty modes, reward scaling & Power Level

### 13.1 Deepen the powerup-card pool — without rewarding mono-weapon cheese
**Decision:** favor **deepening the amplifier pool** (so even a shallow loadout reaches ~99 meaningful picks) over the dynamic slider cap. The dynamic cap stays only as a safety net for genuinely tiny loadouts.

**The worry (valid):** if deepening lets a 1-weapon "focus" loadout reach 99 cards, does it enable a degenerate strategy of dumping everything into one weapon? **No — four things prevent it:**
1. **Per-weapon amplifier caps stay.** A single weapon can only absorb its own amplifiers' total `maxStacks` (~25–35 picks). It *physically cannot* eat 99 cards.
2. **Deepen via a GLOBAL amplifier pool, not bigger single-weapon caps.** This folds Phase **W7's "global efficacy cards / 5th draft slot"** (already the resolved draft composition: *1 primary + 1 power + 1 global + 2 ability*). Global cards (overall damage, fire rate, crit, energy regen, movement, pickup…) are available to **any** loadout, so the deck fills from *global* power, not concentrated single-weapon scaling. Breadth isn't required to reach 99 picks; focus isn't *uniquely* rewarded with more cards.
3. **The Director neutralizes it anyway.** A strong focused build = high **Power Level** (§13.4) → the Director pre-loads tougher enemies. No build gets ahead of the difficulty for free.
4. **The composer punishes one-dimensionality.** Anti-focus waves (swarms vs. single-target, resist-your-element surges) mean a mono-weapon build hits walls it can't brute-force.

**Net:** focus is a legitimate glass-specialist playstyle (high ceiling, exploitable weakness), not a dominant strategy.

### 13.2 Difficulty MODES = tugging the Director (Easy → Legendary)
The player **does** set a difficulty — but it's a **bias on the adaptive Director**, not a fixed multiplier table. Modes: **Easy · Normal · Hard · Epic · Legendary**. (This refines §12.4's "no chosen difficulty": the Director still auto-tunes *per player, per moment* — the mode sets **where the target band sits**.)

A mode shifts:
- **Target HP band** the Director aims to leave you at: Easy ~65–90% · Normal ~45–70% · Hard ~30–55% · Epic ~20–45% · Legendary ~10–35% (near-flawless expected).
- **Baseline ramp** steepness + how aggressively it **pre-loads** off Power Level.
- **Composer aggression:** elite frequency, modifier nastiness, rising resistances.
- **Reward ceiling** (§13.3).

Auto-tuning (incl. anti-death-spiral easing) still operates *within* the mode. **Gating** (the "prove yourself" reward feel): Easy/Normal/Hard open from the start; **Epic unlocks after a Hard clear, Legendary after an Epic clear** (`rainboidsMeta.maxModeCleared`) — new modes feel earned. *(Optional mid-run "tug" — drop a notch if drowning, for reduced rewards — deferred; the within-mode auto-ease already softens bad runs.)*

### 13.3 Reward scaling — mode × depth × performance
**Total reward ≈ modeReward × depthReward × performanceBonus**, all on top of the existing bonuses (boss bias, kill-streak gold), respecting caps:
- **modeReward** (loot rate + gold): Easy ×0.8 · Normal ×1.0 · Hard ×1.3 · Epic ×1.7 · Legendary ×2.2.
- **depthReward:** drop-rate, **item-level**, and the **rarity ceiling** climb with the wave/stage number — so **wave 99 out-drops wave 9** in the same run. (This is the §12.3 endurance curve, made concrete.)
- **rarity ceiling = f(mode, depth):** the top tiers require **both** a high mode **and** deep progress — **Transcendental only on Legendary, deep.** (Supersedes the old chosen-tier ceiling and §12.4c's threat-only ceiling.)
- **performanceBonus:** flawless / fast clears + high achieved Director threat → bonus loot + rarity nudge.

So the best gear in the game = **high mode + deep wave + strong play** — exactly the risk→reward you want, and a concrete reason to push deeper and harder.

### 13.4 Power Level (PL) — the build-strength metric
The Director needs a build-strength estimate to pre-load threat; **PL** is that number.

**Definition** (a geometric blend, so a weakness in one axis drags the whole number down — a glass cannon with no survivability is *not* high PL). **Implementation-ready spec: §14.1.**
```
PL ≈ K × Offense^0.45 × Survivability^0.35 × Utility^0.20
```
- **Offense** — estimated effective DPS: primary `damage × fireRate × multishot × crit-expectation × pierce/AoE` × Σ(amplifier + mechanic-mod + attunement multipliers), plus amortized power-weapon DPS (energy throughput × power damage).
- **Survivability** — effective-health throughput: `effectiveMaxHP / (1−DR) / (1−dodge)` + sustain (regen + lifesteal).
- **Utility** — Σ ability potency + Σ passive value (keystones weighted heavier) + Σ gear item-level + energy economy + SP allocation.

Recomputed on any build change (powerup-card pick, gear equip, passive swap, weapon/ability change). The Director uses PL as the **prior** (pre-load); **observed performance** (the §12.4a signals) is the **correction** — PL can mis-estimate synergies, so real results win. Exact weights/exponents are balance-pass tuning; the *shape* (multiplicative, survivability counts) is the design intent.

### 13.5 Should we show the player their Power Level? — YES (recommended)
- **Show it.** A number that climbs is deeply satisfying (gear-score / item-level / MR lineage), and — more importantly — it makes the adaptive Director **transparent and trustable**: *"enemies got harder because my PWR jumped,"* not *"the game feels arbitrary."* It also helps players pick a mode/run-shape they can handle.
- **How:** a **PWR** readout on the BUILD screen with **live deltas** as you pick cards/gear/passives ("PWR 1,240 → 1,310"), and a compact in-run **PWR vs. THREAT** pairing (beside the threat meter) so the player sees the matchup the Director is balancing.
- **Keep it coarse/smoothed** — a round number + optional tier badge, not a jittery exact-DPS figure.
- **Anti-gaming is built in:** rewards scale with *achieved threat* (which rises with PL, mode, and depth), so deliberately suppressing PL → weaker enemies → **worse loot**. Gaming your PL *down* is self-defeating, which keeps the metric honest. (This is why coupling reward to threat matters — it closes the obvious exploit.)

### 13.6 UI placement — PWR vs. player level
Findings from the current code:
- The **HUD shield badge already shows the player LEVEL** ("LV" inside the shield + the level number to its right; `hud/status.js` ~719–752), with the energy sphere beside it.
- The **stats screen already shows player level + XP** (`ui/stats-overlay.js` summary; lvl + XP-to-next). So "level on the stats screen" is **already done** — no change needed.

**Decision (answers "prefer PWR over level in the HUD?" — yes):**
- **HUD shield badge → PWR.** Repurpose the shield-badge readout (which 6.34.0 already turned into the level display) to show **PWR** — the run-relevant number the Director balances against. Badge label "LV" → **"P"** (a single letter — "PWR" won't fit inside the small shield badge); the **number to its right is the power level**. *Rationale:* PWR changes constantly during a run and explains why enemies scale; level is slow meta-progression that doesn't need HUD real estate.
- **Player LEVEL → stats screen only** (already there). Keep it in the stats summary header with XP progress; that's its home.
- *(Later, optional)* pair a small **THREAT** readout beside PWR so the HUD reads **PWR vs. THREAT** (§13.5) — not required for the first cut; PWR-next-to-shield is the committed change.
- **No code change this turn** — PWR doesn't exist yet (it's computed by the unbuilt Director, §13.4). This is the placement spec for when Phase X builds it. Level-on-stats-screen is already satisfied.

### 13.7 Safe max stages — revising the "100" down
The "100 stages → 99 cards" target was optimistic. Honest pool math (per-weapon **efficacy only**, since mechanic mods are upfront now):
- ~4–5 amplifiers × ~3 stacks ≈ **~12–15 picks per weapon**. A **full** 4 primary + 4 power + 4 ability loadout ≈ **~115–135** meaningful picks; a **focused** loadout (few distinct weapons) is far less.
- So 99 cards is only reachable for *broad* loadouts, and only reliably for *all* loadouts if we build out the **global amplifier pool** (§13.1) — real content work.

**Decision: max stages = 30 (≈ 29 powerup cards) for the first release.** Why this is safe:
- Even a thin **1-weapon + 4-ability** loadout (~15 + ~24 ≈ ~39 picks) comfortably exceeds 29 — **every card is meaningful with zero new content**.
- 30 stages × (3/6/9 waves) = **90–270 waves** — already **3–9× the current 30-wave game**. Plenty long for a "marathon."
- It **defuses the mono-weapon worry**: 29 cards into a focused build is far less degenerate than 99.
- **The 100-stage marathon becomes a later stretch goal**, unlocked once the global amplifier pool exists (which also adds build variety). Raise the cap then.

**Consequences:** stage slider range **10–30** (default 10). Rebase slot scaling to that range: `maxSlots = 3 + floor((stages − 10) / 10)`, cap 5 → **10:3 · 20:4 · 30:5**. The global amplifier pool (§13.1) is therefore **not required for v1** — it's deferred with the 100-stage stretch; at the 30-cap the existing efficacy pool already covers every card.

---

## 14. Algorithm specifications (fine-tuned) — implementation-ready

> Consolidates and **refines** the loose formulas in §12.4 (Director), §13.2 (modes), §13.3 (reward), §13.4 (PWR) into one place. **§14 is authoritative for the math.** Every constant is a starting value flagged for the balance pass (§14.6); the *shapes* are the design intent.

### 14.1 Power Level (PWR)
Recomputed on any build change (powerup-card pick, gear equip, passive swap, weapon/ability change). All inputs come from existing player getters, so there's no double-counting: gear/SP/stacks already flow into the getters that feed Offense & Survivability; Utility captures only what those miss.

```
computePWR(player):
    O = offense(player); S = survivability(player); U = utility(player)
    return round( K_PWR * O^0.45 * S^0.35 * U^0.20 )        // tune K_PWR so a fresh starter ≈ 100

offense(player):                                            // ≈ effective DPS
    dmg   = activePrimary.damage * damageMult(player)        // amplifier+mod+attunement+global stacks
    sps   = 1000 / getEffectivePrimaryFireRate()             // shots/sec
    shots = 1 + multishotStacks(player)
    crit  = 1 + (getEffectiveCritChance()/100) * (getEffectiveCritDamage()/100 - 1)
    reach = 1 + 0.25*pierceCount(player) + 0.40*hasExplosive(player)   // hits-more-targets factor
    primaryDPS = dmg * sps * shots * crit * reach
    powerDPS   = avgPowerDamage(player) * energyRegenPerSec(player) / max(1, avgPowerCost(player))
    return primaryDPS + 0.6 * powerDPS

survivability(player):                                       // effective health + sustain
    ehp     = getEffectiveMaxHealth() / (1 - getEffectiveShield()/100) / (1 - dodgeFrac(player))
    sustain = getEffectiveRegen() + 0.5 * lifestealFrac(player) * offense(player)   // HP/sec
    return ehp + sustain * SUSTAIN_WINDOW                     // SUSTAIN_WINDOW ≈ 4s

utility(player):                                             // what O/S don't capture
    ab = Σ_equippedAbilities( potency / sqrt(cooldownSec) )   // strong + low-CD abilities score higher
    pa = Σ_activePassives( isKeystone ? KEYSTONE_W : MODULAR_W )
    en = energyRegenPerSec(player)*2 + maxEnergy(player)/50
    ua = utilityAffixTotal(player)                            // pickup radius, gold-find, XP… (small)
    return BASE_U + ab + pa + en + ua
```
PWR is the Director's **prior** (pre-load); observed performance (§14.2) is the **correction** — so PWR need not be perfect, only monotone with real build strength.

### 14.2 Adaptive Difficulty Director (per-wave control loop)
Run state: `directorMult` (starts 1.0). Mode sets the target band, ramp rates, and clamps.

```
onWaveClear(wave):
    // 1 — performance → pressure P ∈ [0,1]   (high P = the player struggled)
    hpEnd      = HP_at_clear / maxHP                         // 1 = full
    dmgTaken   = min(damageTakenThisWave / maxHP, 1)
    clearRatio = clamp(actualClearMs / expectedClearMs, 0, 2)   // expected from budget ÷ PWR-DPS
    nearDeath  = (minHPThisWave < 0.15 || revivedThisWave) ? 1 : 0
    P = clamp( W_HP*(1-hpEnd) + W_DMG*dmgTaken + W_CLEAR*(clearRatio/2) + W_ND*nearDeath, 0, 1 )

    // 2 — steer directorMult toward keeping P inside the mode's band [Plo,Phi]
    (Plo,Phi) = MODE_BAND[mode]
    if   P < Plo:  directorMult *= (1 + UP_RATE[mode])        // too easy → ramp up
    elif P > Phi:  directorMult *= (1 - DOWN_RATE[mode])      // too hard → ease (DOWN_RATE > UP_RATE: anti-death-spiral)
    else:          directorMult += (DRIFT_TARGET - directorMult) * 0.05   // gentle settle
    directorMult = clamp(directorMult, MULT_MIN[mode], MULT_MAX[mode])

enemyPower(wave) = baseline(wave) * MODE_BASE[mode] * directorMult * pwrPreload(PWR)
pwrPreload(PWR) = clamp( (PWR / PWR_REF)^0.5, 0.8, 3.0 )      // strong build pre-faces tougher enemies

// distribute enemyPower across knobs (exponents sum to 1.0 → product == enemyPower):
hpMult      = enemyPower^0.50
dmgMult     = enemyPower^0.30
densityMult = enemyPower^0.20
toughnessDR = clamp( baseDR + (enemyPower-1)*0.05, 0, 0.60 )
resistDrift = toward player's most-used element, strength = MODE_RESIST[mode]   // separate channel
// SPEEDS are clamped — never scaled by enemyPower beyond SPEED_CAP (keeps projectiles dodgeable)
```
`expectedClearMs` = `threatBudget(wave) / estimatedPlayerDPS(PWR)` × pacing constant — so "fast/slow clear" is judged against the player's own power, not a fixed clock.

### 14.3 Procedural wave composer (threat budget → roster)
```
threatBudget(wave) = BUDGET_BASE * enemyPower(wave) * waveKind        // normal 1.0 · elite 1.5 · (boss = fixed boss, scaled by directorMult)
compose(wave):
    theme = weightedPick(THEMES, MODE_THEME_W[mode])                   // swarm/artillery/armored/elemental/ambush/mixed
    affix = (rand() < AFFIX_CHANCE[mode]) ? weightedPick(MODIFIERS) : none
    budget = threatBudget(wave) * (affix ? affix.budgetMult : 1)
    roster = []
    while budget >= cheapestCost(theme) and roster.length < ROSTER_CAP:
        e = pickEnemyForTheme(theme, budget)                          // weighted; cost ≤ remaining budget
        roster.push(e); budget -= e.threatCost
    if isEliteWave(wave): roster += eliteIfy(pickEnemy(theme), ELITE_FRACTION*threatBudget)
    return { roster, theme, affix }

enemy.threatCost ≈ baseHP * dmgWeight * dangerWeight                   // precomputed per archetype
```
Aggregate difficulty is *tuned* by the budget; the *exact* roster + theme + affix are randomized → fresh every wave.

### 14.4 Reward scaling (mode × depth × performance)
```
rewardMult(wave) = MODE_REWARD[mode] * depthReward(wave) * perfBonus      // applied to drop-rate + gold
depthReward(wave) = 1 + DEPTH_RATE * (wave - 1)                           // e.g. +2%/wave
perfBonus = 1 + (flawlessWave?0.25:0) + (fastClear?0.15:0) + (directorMult-1)*0.30

// item rarity & level:
rarityBias    = clamp( MODE_BIAS[mode] + DEPTH_BIAS*(stage-1) + (directorMult-1)*0.20, 0, 1 )
rarityCeiling = CEILING[mode][stageBand]                                  // gate: Transcendental only on Legendary, deep
itemLevel     = BASE_ILVL + wave*ILVL_PER_WAVE + MODE_ILVL[mode]
drop → createItem(slot, itemLevel, rollRarity(rarityBias, ceiling=rarityCeiling))
```
`rollRarity` gains a `ceiling` arg (hard cap on the tier) alongside the existing bias. This is where "better loot at wave 99 than wave 9" and "Legendary-mode-only Transcendental" both live.

### 14.5 Enemy baseline curve (absolute, monotonic)
Replaces the run-normalized `t=(w-1)/(N-1)` curve so longer runs keep escalating:
```
baseline(wave) = 1 + A*wave + B*wave^1.5         // A≈0.15, B≈0.06
//   baseline(30) ≈ 1 + 4.5 + 9.9 ≈ 15.4   (matches today's wave-30 finale HP mult)
//   baseline(90) ≈ 1 + 13.5 + 51 ≈ 65     (head-room for the future 100-stage stretch)
```

### 14.6 Constants table (all tunables in one place)
| Constant | Start | Meaning |
|---|---|---|
| `K_PWR` | tuned so starter ≈ 100 | PWR scale |
| `PWR_REF` | starter-build PWR | pre-load reference |
| `SUSTAIN_WINDOW` | 4 s | sustain → EHP horizon |
| `KEYSTONE_W / MODULAR_W` | 3 / 1 | passive utility weights |
| `W_HP / W_DMG / W_CLEAR / W_ND` | 0.40 / 0.25 / 0.20 / 0.15 | pressure-signal weights |
| `MODE_BAND` | Easy .15–.40 · Normal .30–.55 · Hard .45–.70 · Epic .55–.80 · Legendary .65–.90 | target pressure band (higher = mode wants you under more pressure) |
| `UP_RATE / DOWN_RATE` | per mode, e.g. Normal 0.05 / 0.10 | per-wave ramp; DOWN > UP (anti-death-spiral) |
| `MULT_MIN / MULT_MAX` | per mode, e.g. 0.6 / 2.5 | clamp on `directorMult` |
| `MODE_BASE` | Easy 0.8 · Normal 1.0 · Hard 1.25 · Epic 1.6 · Legendary 2.0 | static mode multiplier under the Director |
| `MODE_RESIST` | 0 / .1 / .2 / .35 / .5 | rising-resistance strength |
| `A / B` | 0.15 / 0.06 | baseline curve (§14.5) |
| `BUDGET_BASE` | tuned to wave-1 feel | composer budget unit |
| `AFFIX_CHANCE` | Easy 0 · Normal .15 · Hard .3 · Epic .45 · Legendary .6 | wave-modifier frequency |
| `ROSTER_CAP / ELITE_FRACTION` | ~40 / 0.5 | composer caps |
| `MODE_REWARD` | 0.8 / 1.0 / 1.3 / 1.7 / 2.2 | loot+gold multiplier |
| `DEPTH_RATE / DEPTH_BIAS` | 0.02 / 0.04 | depth → reward + rarity bias |
| `BASE_ILVL / ILVL_PER_WAVE / MODE_ILVL` | tuned | item-level scaling |
| `maxSlots` | `3 + floor((stages−10)/10)`, cap 5 | passive slots (§13.7) |
| `stages` | slider 10–30 (default 10) | run length |
| `wavesPerStage` | radio 3/6/9 (default 3) | stage size |
| `cards` | `stages − 1` | powerup-card picks |

### 14.7 Mode unlock gating (refined)
`rainboidsMeta.maxModeCleared` (default `'HARD'` open). Unlock the next mode by **clearing ≥ N stages of a run at the current top mode** (not a full clear): **Epic** after clearing ≥ stage 5 on **Hard**; **Legendary** after clearing ≥ stage 5 on **Epic**. Easy/Normal/Hard are open from the start. Locked modes show greyed with their unlock condition.
