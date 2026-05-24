# Passive Skills & Run Difficulty — Design Plan

**Date:** 2026-05-24
**Status:** Brainstorm / design — not yet scheduled into a version.
**Scope:** Two new systems — (1) a **Passive Skills** layer (3 gold-bought, slot-gated, swappable gameplay-modifier relics) and (2) a **Run Configurator** that lets the player choose run length / boss count / difficulty, with difficulty scaling loot quantity and quality.

---

## 1. Goals

- **Passives** = build-defining *gameplay modifiers* (not stat increments). 3 slots, bought with account-gold like weapons/abilities, slot-gated over the run, **swappable mid-run from the menu**. They should *drastically change how the run plays* and **stack synergistically** in deliberate clusters.
- **Run Configurator** = player picks how long the run is (stages → waves), how many bosses, and a **difficulty tier**. Higher difficulty = tougher enemies **and** more drops + better item rarity (risk → reward).
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

The planned **C.I3 traits** and **C.I4 keystones** were always meant to be "a shared `ITEM_TRAITS` pool with two delivery channels (drop + stage-clear keystone card)." The Passive Skills feature is best built as **that same pool**, with the **equip slot as a third (primary) delivery channel**:

```
            ┌─────────────────────────────────────────┐
            │   PASSIVES  (one rule-modifier registry) │
            │   id · name · desc · hooks · downside     │
            │   tags (offense/defense/element/econ/…)   │
            └───────────────┬───────────────┬──────────┘
       equip slot (NEW)     │   keystone card (C.I4)   │   top-tier item roll (C.I3)
   gold-bought, 3 slots,    │   stage-clear pick       │   Legendary+ / Transcendental
   swappable mid-run        │   (later)                │   (later)
```

**Consequence:** Phase C's C.I3a/b/c + C.I4 are **folded into the Passive phase** (they become "delivery channels for the passive pool," scheduled after the core slot system). This avoids building two parallel modifier systems. One registry, one set of consumer hooks, three ways to acquire.

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
- **3 total slots.** Slot 1 available from run start. Slot 2 and Slot 3 unlock **during** the run.
- Default cadence (standard 10-stage run): **Slot 2 after clearing Stage 3, Slot 3 after clearing Stage 6.**
- **Generalized for variable run length** (see §6): unlock Slot 2 at stage `ceil(stages × 0.3)` and Slot 3 at stage `ceil(stages × 0.6)` → exactly 3 & 6 in a 10-stage run, and sensible for short/long runs.
  - *Fork:* absolute stages (3/6 always) vs. fractional (scales). **Recommend fractional** so short custom runs still grant all 3 slots.

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
  stages:        10,   // 3..20 (default 10) — also the BOSS count (1 boss / stage final)
  wavesPerStage: 3,    // 2..5  (default 3)
  difficulty:    1,     // tier index, 1 = baseline
}
// derived: totalWaves = stages × wavesPerStage; bossWaves = every wavesPerStage-th wave
```

This **replaces the hardcoded `MAX_WAVES = 30`** with `runConfig.stages × runConfig.wavesPerStage`. Because the enemy-scaling curves already normalize on `t = (w-1)/(totalWaves-1)`, they **auto-stretch**: a 60-wave run ramps gently, a 15-wave run ramps steeply — no per-wave retuning needed. `BOSS_WAVES`, `isCardStage`, `isStageClear`, and the run-complete check (`currentWave >= totalWaves`) all read the config.

### 6.2 What difficulty scales
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

### 6.3 Cadence & slot-unlock scaling (must adapt to variable length)
- **Card draft** stays "every 2nd stage clear" → auto-scales (10 stages → 5 cards; 20 → 10; 6 → 3).
- **Passive slot unlocks** at stage `ceil(stages·0.3)` and `ceil(stages·0.6)` (§4.1).
- **XP/level** (meta) accrues per wave-clear as today — more waves = more meta XP, naturally.

### 6.4 RUN SETUP UI
A small pre-run screen (or a panel folded into the BUILD → START flow): **Stages** slider, **Waves/stage** slider, **Difficulty** tier selector, and a **live readout** of the resulting modifiers ("Enemies +48% · Drops +40% · Rarity bias +0.24 · Gold +40%"). `START RUN` writes `runConfig` and proceeds.

### 6.5 Reconciliation
- **Absorbs W8 "Ascension."** W8 described "escalating endless difficulty after first clear: enemy HP/dmg/density + rising resistances; higher item-level gear + more gold." That **is** this difficulty system. Recommend: difficulty tiers above your first clear *are* Ascension; mark W8's Ascension bullet as folded into this phase. (Endless/marathon length + rising resistances can be the top difficulty tiers.)
- **Mobile scaling** already multiplies wave configs separately — keep it as an independent platform factor layered under `difficulty`.
- **Gating:** optionally lock higher difficulty tiers behind clearing lower ones (classic ascension unlock), stored in `rainboidsMeta.maxDifficultyCleared`. *(Fork: gate tiers vs. all-open. Recommend gating — gives a progression spine.)*

---

## 7. Implementation outline (→ Plans.md Phase P & Phase X)

**Phase P — Passive Skills**
1. **P1** Registry + reconciliation: rename `PASSIVE_UPGRADES→STAT_UPGRADES`; new `PASSIVES` registry (`passive-data.js`) with hook metadata; `passives` unlock category + meta key; fold C.I3/C.I4 plan into this pool.
2. **P2** Player state + apply pipeline: `equippedPassives[3]`, `ownedPassives`, `activePassives` Set, `hasPassive`, `getPassiveMod`; slot-unlock state.
3. **P3** Slot gating: unlock slots 2 & 3 at the stage thresholds (wave-clear hook).
4. **P4** BUILD-tree PASSIVES cluster (unlock + the run's chosen pool) + loadout carry.
5. **P5** In-run swap menu (pause panel) + ramp-reset-on-swap.
6. **P6** Catalog batch 1 (~10–12 passives, one per archetype) — each with a live consumer + unit test.
7. **P7** Later delivery channels: keystone cards (old C.I4) + top-tier item rolls (old C.I3) draw from the same pool.

**Phase X — Run Configurator & Difficulty**
1. **X1** `runConfig` object; replace `MAX_WAVES` reads with config; run-complete + boss schedule + cadence read config.
2. **X2** Difficulty multipliers wired into enemy scaling + `dropOrbsFromEntity` + `rollRarity(bias)` + gold.
3. **X3** Cadence/slot-unlock scaling for variable length.
4. **X4** RUN SETUP UI + live readout; persist in save for CONTINUE.
5. **X5** Difficulty-tier gating (`maxDifficultyCleared`) — absorbs W8 Ascension.
6. **X6** Balance pass (AI-survival across a short low-diff and a long high-diff run).

---

## 8. Open forks for sign-off (recommendations in **bold**)

1. **Naming** — rename stat `PASSIVE_UPGRADES→STAT_UPGRADES` and call the new layer **"Passives"** *(recommended)*, vs. name the new layer "Relics" and leave stat code alone.
2. **Unify with traits/keystones** — fold C.I3/C.I4 into the passive pool as alternate delivery channels *(recommended)*, vs. keep item traits a separate item-bound system.
3. **Mid-run swap** — **free swap with ramp-reset** *(recommended)* vs. swap-only-at-stage-clear vs. post-swap cooldown.
4. **Slot-unlock timing** — **fractional (`ceil(stages·0.3/0.6)`)** *(recommended)* vs. absolute stages 3 & 6.
5. **Difficulty tiers** — **gated (clear-to-unlock, = Ascension)** *(recommended)* vs. all-open from the start.
6. **Run-length bounds & default** — proposed stages 3–20 (default 10), waves/stage 2–5 (default 3); confirm or adjust.
