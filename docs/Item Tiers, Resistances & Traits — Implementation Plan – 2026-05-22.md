# Item Tiers, Resistances & Traits — Implementation Plan

**Created:** 2026-05-22
**Status:** Plan — phases I1 ready; I3 gated on Element E3/E4 + Skills S1
**Companion to:** `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (§8, §9)
**Owner:** Claude + Afeique

## Locked design decisions

- **8 rarity tiers:** Common → Rare → Exceptional → Legendary → Epic → Godlike →
  Divine → Transcendental.
- **Tiers discerned by how much they roll** — stat affixes, resist rolls, and
  game-changing traits all climb with tier.
- **Game-changing traits** are a modifier class *separate* from stat affixes.
  Trait counts: Legendary 1, Epic 2, Godlike 3, Divine 4, **Transcendental 5** —
  a single top-tier drop can rewrite the run.
- **Resistance affixes** tie items to the element system (two-way).
- **Traits and keystone-cards share one modifier pool** (two delivery channels).

## Why phased this way (dependencies)

The existing code already **scales affix count by rarity** (`item-system.js`
`affixCount = epic?3 : rare?2 : 1`) and has a `RARITY_TIERS` map + `rollRarity()`
+ glow colors — so **I1 (the ladder) is a direct extension, buildable now.**

But many traits *change rules that don't exist yet*: Hex Touch needs CORRODE,
Frostbite needs CHILL, Conductor needs CONDUCT (all from **Element plan E3/E4**),
and Twin Cast / Adrenaline Junkie need the **4-slot skill model (Skills S1)**.
So **I3 (traits) ships in batches gated on those**, not all at once.

```
I1 rarity ladder (now) ──┬─ I2 resist roll display (after Element E7)
                         └─ I3 trait class (batched; gated on Element E3/E4 + Skills S1)
                                              └─ I4 keystone reconcile
```

---

## Phase I1 — Rarity ladder expansion (8 tiers)

**Goal:** grow the 3-tier system to 8, with distinct colorations and
roll-counts. No traits yet.

**The ladder**

| # | Tier | Color | Glow | Affixes | Resist rolls |
|---|---|---|---|---|---|
| 1 | Common | `#b8c0cc` | 0.45 | 1 | 0 |
| 2 | Rare | `#5cc6ff` | 0.85 | 2 | 0 |
| 3 | Exceptional | `#36e6a0` | 1.05 | 3 | 0–1 |
| 4 | Legendary | `#ffb43a` | 1.35 | 3 | 1 |
| 5 | Epic | `#c060ff` | 1.6 | 4 | 1 |
| 6 | Godlike | `#ff3d6e` | 1.9 | 4 | 1–2 |
| 7 | Divine | `#fff0a0` | 2.3 | 5 | 2 |
| 8 | Transcendental | prismatic (animated) | 2.8 | 5 | 2 |

**Files**
- `js/modules/world/item-names.js`:
  - expand `RARITY_TIERS` to 8 entries (`weight`, `multMin/Max`, `color`,
    `glow`, `label`, `rarityAdjective`). Update `RARITY_ORDER`.
  - rewrite `rollRarity(bonusRare, bonusEpic, …)` → weighted N-way pick with a
    single boss-bias parameter that shifts mass up the ladder.
  - Transcendental: add an `animated: true` / `prismatic: true` flag the
    renderer reads to cycle hue (reuse the game's rainbow-cycle).
- `js/modules/world/item-system.js`:
  - `createItem` — replace the `epic?3:rare?2:1` affix-count line with a
    `tier.affixCount` lookup (per the table); add `tier.resistRolls`.
- `js/modules/hud/item-feed.js` + `js/modules/ui/inventory-overlay.js` — render
  the 8 labels/colors; prismatic shimmer for Transcendental.

**Acceptance**
- Drops roll across 8 tiers at intended weights (Transcendental ultra-rare);
  higher tiers visibly roll more affixes; colors/glow distinct at a glance.
- Unit tests: `affixCount`-by-tier; `rollRarity` distribution within tolerance;
  boss bias shifts the curve up.

**Risks**
- Drop-rate balance — Transcendental should be a memorable once-a-run-if-lucky
  event, not a slot machine. Tune weights + boss bias.

---

## Phase I2 — Resistance rolls (after Element E7)

**Goal:** items roll per-element resistance, scaling count with tier
(`resistRolls` column above).

**Files**
- Builds on **Element plan E7** (resist affixes already added to
  `ITEM_AFFIX_POOL`). This phase wires the **tier-gated count** (Exceptional+
  start rolling resist; high tiers roll the rare `allResist`) and the inventory
  display of resist lines.

**Acceptance**
- Resist rolls appear on Exceptional+ items and scale with tier; a high-tier
  item can roll all-element resist.

---

## Phase I3 — Game-changing trait class (batched)

**Goal:** add the marquee modifier class — rules, not numbers — rolled on
Legendary+ by the trait-count ladder.

**Data**
- **NEW `js/modules/world/item-traits.js`** — `ITEM_TRAITS` catalog
  (`{ id, name, desc, hook }`) for the §8.3 traits. `hook` tags where it plugs
  in: `projectile | damage | onHit | economy | survival | skill`.
- `js/modules/world/item-system.js` `createItem` — roll `tier.traitCount`
  distinct traits from `ITEM_TRAITS` (Legendary 1 … Transcendental 5).
- `js/modules/player/player.js` — `getActiveTraits()` aggregates traits across
  the 5 equipped items (mirror the `getPowerupStacks` / `getItemAffixTotal`
  pattern); each consumer checks it.

**Consumers (where each trait wires in)**
| Trait group | Hook site |
|---|---|
| Bullet Bloom, Echo, Overpenetration, Ricochet Soul | `weapons.js` spawn / `bullet.js` |
| Glass Cannon, Berserker's Pact, Momentum, Executioner's Edge, Crit Cascade | damage path (`combat-manager`/`collision-system`) |
| Hex Touch→CORRODE, Frostbite→CHILL, Conductor→CONDUCT, Elemental Overflow, Prismatic Soul | on-hit status — **needs Element E3/E4** |
| Orb Magnet, Hoarder's Greed, Midas Hits | economy (`combat-manager` drop path) |
| Second Heart, Reactive Plating, Glass Reflection, Phase Walker | `lifecycle.js takeDamage` / dash |
| Twin Cast, Adrenaline Junkie, Overcharged | `skills.js` — **needs Skills S1** |

**Sequencing (batches, not all 20 at once):**
1. **I3a — self-contained traits** (Glass Cannon, Bullet Bloom, Echo, Orb
   Magnet, Hoarder's Greed, Momentum, Executioner's Edge, Second Heart, Reactive
   Plating) — no cross-system dependency. Ship first.
2. **I3b — element traits** (Hex Touch, Frostbite, Conductor, Elemental
   Overflow, Prismatic Soul) — after Element E3/E4.
3. **I3c — skill traits** (Twin Cast, Adrenaline Junkie, Overcharged) — after
   Skills S1.

**Acceptance**
- A Transcendental with 5 traits visibly stacks all 5.
- **Every trait has a working consumer — no placebos** (explicit nod to the
  Dead Skills & Upgrades audit). A unit/QA check asserts each `ITEM_TRAITS`
  entry has a live hook.
- Anti-synergy allowed (a Transcendental can roll traits that fight each other).

**Risks**
- Largest consumer surface in the plan — that's why it's batched by dependency.
- Stacking 5 traits is overpowered *by design*; gate with rarity, not nerfs.
  The **Warden** enemy (Element E8) is the deliberate check on single-element
  god-rolls.

---

## Phase I4 — Keystone reconcile (shared pool)

**Goal:** one modifier pool, two delivery channels.

**Files**
- The stage-clear "survivor card" pick (`wave-manager.js` `openWavePickOverlay`)
  offers, occasionally, a **keystone card** drawing from `ITEM_TRAITS` instead of
  spawning a duplicate keystone pool.

**Acceptance**
- A given rule-change can be acquired by a Legendary+ drop *or* a keystone card;
  one balance surface.

---

## Cross-cutting

- **Sell/refund:** the existing sell path refunds last-stack cost — define how a
  *traited* item sells (refund value? trait loss?). Open question below.
- **Auto-equip score:** `scoreItem` ignores traits today; decide whether traits
  influence auto-equip or whether high-tier items are always manual-equip
  (recommend: traited items never auto-replace — they're player decisions).
- **Versioning:** I1 MINOR; I2 MINOR; I3a/b/c each MINOR; I4 MINOR.
- **README:** rarity tiers, item traits, resistance rolls.

## Open questions

1. **Auto-equip vs traits** — should a Transcendental ever auto-equip over a
   high-score common, or always require a manual choice? (Recommend manual.)
2. **Duplicate-trait handling** — can two equipped items both roll Glass Cannon
   (stacking), or are traits deduped across the loadout?
3. **Trait stacking caps** — any global cap on simultaneous traits across 5
   slots, or fully uncapped (the "insane" fantasy)?
4. **Sell value of traited items** — flat high refund, or no refund (too good to
   sell)?
5. **Transcendental drop source** — bosses only, deep-wave only, or any kill at
   a vanishing rate?
