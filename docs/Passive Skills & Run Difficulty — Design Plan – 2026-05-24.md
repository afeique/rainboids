# Passive Skills & Run Difficulty — Design Plan

**Date:** 2026-05-24
**Status:** Brainstorm / design — not yet scheduled into a version.
**Scope:** Two new systems — (1) a **Passive Skills** layer (3 gold-bought, slot-gated, swappable gameplay-modifier relics) and (2) a **Run Configurator** that lets the player choose run length / boss count / difficulty, with difficulty scaling loot quantity and quality.

---

## 1. Goals

- **Passives** = build-defining *gameplay modifiers* (not stat increments). Equip slots (3 baseline, scaling up to 5 by run length — §11.A), bought with account-gold like weapons/abilities, slot-gated over the run, **swappable mid-run from the menu**, and **also rollable on gear** (shared registry). They should *drastically change how the run plays* and **stack synergistically** in deliberate clusters.
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
   gold-bought, 3–5 slots,  │   stage-clear pick       │   Legendary+ / Transcendental
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
  stages:        10,   // slider 10..100 (default 10) — also the BOSS count (1 boss / stage)
  wavesPerStage: 3,    // radio 3 | 6 | 9 (default 3)
  difficulty:    1,    // tier index, 1 = baseline (separate axis; §11.C)
}
// derived: totalWaves = stages × wavesPerStage (30..900)
//   within a stage (local wave 1..W): last wave = BOSS; other multiples of 3 = ELITE; rest = normal
//   CARD pick after every stage (boss) clear  →  cards = stages
```

This **replaces the hardcoded `MAX_WAVES = 30`** with `runConfig.stages × runConfig.wavesPerStage`. Enemy scaling switches from run-normalized to **absolute** (§11.D) so longer runs keep escalating instead of plateauing. `isBossWave`, the new **elite** schedule, the **card-every-stage** cadence, passive-slot unlocks, and the run-complete check (`currentWave >= totalWaves`) all read the config.

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

### 6.3 Cadence & slot-unlock scaling
- **Card draft: every stage clear** (= every boss) → cards = stages (10–100). Once efficacy amplifiers cap, drafts fall back to passive / Cores cards (§11.E).
- **Elite (miniboss): every 3rd wave** that isn't the stage boss (§11.B).
- **Passive slot unlocks:** progressive across the run, up to `maxSlots(stages)` (§11.A).
- **XP/level** (meta) accrues per wave-clear — more waves = more meta XP, naturally.

### 6.4 RUN SETUP UI
A small pre-run screen (or a panel folded into the BUILD → START flow): **Stages** slider, **Waves/stage** slider, **Difficulty** tier selector, and a **live readout** of the resulting modifiers ("Enemies +48% · Drops +40% · Rarity bias +0.24 · Gold +40%"). `START RUN` writes `runConfig` and proceeds.

### 6.5 Reconciliation
- **Absorbs W8 "Ascension."** W8 described "escalating endless difficulty after first clear: enemy HP/dmg/density + rising resistances; higher item-level gear + more gold." That **is** this difficulty system. Recommend: difficulty tiers above your first clear *are* Ascension; mark W8's Ascension bullet as folded into this phase. (Marathon length — up to 100 stages — + rising resistances at the top tiers carry the Ascension fantasy without a separate endless mode.)
- **Mobile scaling** already multiplies wave configs separately — keep it as an independent platform factor layered under `difficulty`.
- **Gating:** optionally lock higher difficulty tiers behind clearing lower ones (classic ascension unlock), stored in `rainboidsMeta.maxDifficultyCleared`. *(Fork: gate tiers vs. all-open. Recommend gating — gives a progression spine.)*

---

## 7. Implementation outline (→ Plans.md Phase P & Phase X)

**Phase P — Passive Skills**
1. **P1** Registry + reconciliation: rename `PASSIVE_UPGRADES→STAT_UPGRADES`; new `PASSIVES` registry (`passive-data.js`) with hook metadata; `passives` unlock category + meta key; fold C.I3/C.I4 plan into this pool.
2. **P2** Player state + apply pipeline: `equippedPassives[]` (length = `maxSlots`, up to 5), `ownedPassives`, `activePassives` Set, `hasPassive`, `getPassiveMod`, keystone-budget enforcement (≤2); slot-unlock state.
3. **P3** Slot gating: `maxSlots = 3 + floor(stages/30)` (cap 5); unlock slots progressively at stage milestones (wave-clear hook).
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

---

## 9. Round-2 decisions (2026-05-24)

Confirmed by product owner:

1. **Naming — stats are "Stats," full stop.** Rename `PASSIVE_UPGRADES → STATS` and `PASSIVE_REWARD_IDS → STAT_CARD_IDS` (drop *both* "passive" and "upgrade"; SP_STATS keeps its name as the SP-allocation defs — the two reference the same stat families). User-facing label: **STATS**. "Passives" now exclusively means the rule-modifier layer.
2. **Shared registry across items AND passive slots — confirmed.** One `PASSIVES` registry; an entry declares where it can live (slot / item / both). Players can **roll items that carry passive skills** (a passive-affix on higher-tier gear). See §10 for the expanded catalog + delivery/stacking rules.
3. **Mid-run swap — confirmed** (free swap, ramp-reset on swap).
4. **Slots scale with run length** (capped — §11.A) — *no endless*; stages 10–100 with a definite end (§11.B).
5. **Difficulty tiers gated, reward-feeling** — design in §11.C.
6. **Waves/stage = radio 3/6/9 (default 3)**, stages = slider 10–100; elite every 3rd wave, boss + card every stage (§11.B); scaling §11.D; long-run reconciliations §11.E; **mid-run loadout access** §11.F.

> **Round-3 (2026-05-24):** §10.1 adds 7 keystones + 9 modular passives; §11.A answers the "max passives" question (slots cap **5** + keystone budget **2**, gear adds modular); §11.B finalizes the run structure (no endless). These supersede the round-1 §8 forks and the round-2 notes above where they differ.

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

- **Max equipped slots scales with run length** — `maxSlots = 3 + floor(stages / 30)`, capped at **5**:

  | stages | 10–29 | 30–59 | 60–100 |
  |---|---|---|---|
  | **max slots** | 3 | 4 | 5 |

  Slots unlock **progressively** across the run (slot 1 at start; the rest at evenly-spaced stage milestones), so "more stages → more passives" holds and a long run *feels* like a power ramp — but it tops out at 5.
- **Keystone budget = 2.** At most 2 equipped slots may hold **keystones** (build-rewriting); the rest take **modular** passives. Start conservative — loosening this after playtest is trivial; clawing back an OP launch is not.
- **Gear rolls MODULAR passives only** (Exceptional+ rolls one; Transcendental may *rarely* roll a keystone as a chase payoff that doesn't count against the budget). Across 5 gear slots that's up to ~5 more modular passives — realistically 2–3.
- **Net maximum simultaneous: ~5 slots + ~5 gear ≈ up to ~10 passives, but only ~2 keystones** (plus a rare Transcendental keystone). Rich and layered, with no degenerate "all-keystones" state.

**Why this is *lower* than the 6–8 we floated earlier:** now that **gear also supplies passives**, the slot cap must come down to keep the *total* in check — the "more passives" fantasy is delivered partly by loot, not slots alone. And you're right that passives are unproven: shipping **tight (5 slots / 2 keystones)** and loosening from playtest data is the safe path. The backstop that keeps even a maxed build honest is the **unbounded enemy scaling** (§D) — the longer/harder the run, the more the threat outpaces your stacked passives.

### B. Run length & structure (no endless — long, but it ends)

- **Stages: a slider, 10 → 100** (default **10**). **No endless mode.** The longest run is 100 stages and has a definite finish + completion payoff — "a lot of waves, but there's an end."
- **Waves per stage: a radio — 3 / 6 / 9** (multiples of three; default **3**).
- **Intra-stage rhythm** — within a stage of `W` waves, the **last wave is the BOSS**, and every *other* multiple-of-3 wave is a guaranteed **ELITE (miniboss)**:

  | waves/stage | layout |
  |---|---|
  | **3** | normal · normal · **BOSS** *(no elite)* |
  | **6** | n · n · **ELITE** · n · n · **BOSS** |
  | **9** | n · n · **ELITE** · n · n · **ELITE** · n · n · **BOSS** |

- **Every stage ends with a boss, and every stage clear grants a CARD pick** — that's what gives stage completion a concrete meaning. So **cards = number of stages (10–100)**, bosses = stages, elites = `stages × (W/3 − 1)`.
- **Total waves = stages × W → 30 (10×3) up to 900 (100×9).** Length is itself a difficulty axis (the absolute scaling in §D climbs the whole way), layered *on top of* the chosen difficulty tier (§C). A 100-stage / 9-wave run at a high tier is the ultimate gauntlet — brutal, multi-hour, but beatable and finite.

This supersedes the old "card every 2nd stage" cadence (§6.3 → now **card every stage**) and the old "elite at mid-stage" idea (old §E → now **elite every 3rd wave**).

### C. Difficulty gating (reward-feeling, low-friction)
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
- **Card stacking → passive cards.** Up to **100 card drafts**, but efficacy amplifiers have `maxStacks` caps and plateau. Once a player's relevant amplifiers are maxed, the per-stage draft should **fall back to PASSIVE cards** (keystone/modular from the shared registry — this *is* the C.I4 "keystone card" channel, P7) and/or **Cores/gold**. So the card-every-stage cadence naturally becomes a **passive-delivery channel** in long runs — a clean tie between the card system and the passive registry.

### F. Mid-run loadout access (the key call)
- **Recommendation — tiered commitment, auto-scaling with run length:**
  - **Passives:** swap **anytime** (already decided).
  - **Gear / inventory (items):** re-equip **anytime** — it's defensive/stat, low cheese risk, and lets collected loot matter immediately.
  - **Weapons / abilities / attunements:** re-build only at **stage-boss "Refit" checkpoints** (the screen that already pauses at stage clear). Within a stage you're committed.
- **Why this beats both extremes:** fully-free anytime swapping lets you hard-counter every single wave (swap to the perfect element/weapon each fight), which erases build identity and the roguelite tension. Locking everything for a 100-wave run feels awful because you collect mountains of loot you can't use. **Checkpoint-refit threads it:** you adapt to what you've earned between stages, but commit within a stage.
- **It auto-answers "when to allow vs. lock"** with no special rule: a **short punishing run has few checkpoints** (you're mostly stuck with your build — the punishment you asked for), while a **long gauntlet has many** (you naturally re-tool as you go). Difficulty + length *is* the commitment dial.
- *If you'd rather minimize friction:* the fallback is "gear + passives anytime, weapons/abilities/attunements also anytime" — fully free. Viable, but I'd hold the line at checkpoint-refit for offense to keep builds meaningful.
