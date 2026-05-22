# Element & Resistance System — Implementation Plan

**Created:** 2026-05-22
**Status:** Plan — awaiting go-ahead on Phase E1
**Companion to:** `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (§5, §7)
**Owner:** Claude + Afeique

## Locked design decisions

- **7 elements:** Kinetic, Pyro, Cryo, Volt, Toxic, Void, Radiant — all shipped.
- **Two-way combat:** elements flow player→enemy *and* enemy→player. Enemy
  attacks carry an element; the player has resistances; statuses can be applied
  to the player as well as to enemies.
- This is the **foundation** the Skills, Items, and new-weapon plans depend on.

## Phase map (dependency order)

```
E1 taxonomy + data model ─┬─ E2 player→enemy resist ─┐
                          │                          ├─ E4 synergy reactions
                          └─ E3 status engine ───────┘        │
E5 enemy→player + player statuses ───────────────────────────┤
E6 weapon element identity ──────────────────────────────────┤
E7 item resistance affixes ──────────────────────────────────┤
E8 enemy retrofit + first elemental/anti-meta types ─────────┘
```

E1 is pure plumbing (no behavior). E2/E3 are independent and both feed E4.
E5 completes the two-way loop. E6 gives weapons identity. E7/E8 are content.
Each phase is ≥1 MINOR, its own commit(s).

---

## Phase E1 — Element taxonomy + data model (no behavior change)

**Goal:** establish element as a first-class property on weapons, enemies, and
the player, plus a central resistance helper — all returning neutral until later
phases wire behavior. Zero gameplay change; pure data + plumbing.

**Files**
- **NEW `js/modules/combat/elements.js`** — `ELEMENTS` config keyed by id:
  `{ id, name, color, statusId, fxHint }` for the 7. `ELEMENT_IDS` array.
  `elementalMultiplier(resistMap, element)` → `clamp(1 - (resistMap[element]||0), 0, 2)`
  (negative resist = weakness >1; `1.0` resist = immune = 0 dmg).
- `js/modules/combat/weapon-data.js` — add `element: 'KINETIC'` (etc.) to every
  `PRIMARY_WEAPONS` and `POWER_WEAPONS` entry. Initial mapping: Cryo Burst→CRYO,
  Arc Lightning→VOLT, Nova Blast→VOLT, Gravity Lance & Singularity→VOID, Lance
  Beam & Prism Beam→RADIANT; everything else→KINETIC (re-themed in E6 as
  elemental weapons ship).
- `js/modules/enemy/enemy-data.js` — add `element` (its attack element) and
  `resist: {}` (empty = neutral) to each `ENEMY_TYPES` entry.
- `js/modules/player/bullet.js` — `Bullet` carries `this.element`; set on spawn.
- `js/modules/player/weapons.js` — every firing path sets `bullet.element =
  weaponConfig.element`. Derived projectiles (cluster bomblets, flak shrapnel,
  split shards, missiles) inherit the parent's element.
- `js/modules/player/player.js` / `progression.js` — `getElementResist(element)`
  returns base 0 + (item resist affixes, added in E7) for now.

**Acceptance**
- All 22 weapons + 10 enemies carry an element + resist map.
- Unit test: `elementalMultiplier` returns 1.0 (neutral), >1 (weak), <1 (resist),
  0 (immune) for sample maps.
- No visible gameplay change (helper unused in damage paths yet).

**Risks**
- Missing a projectile spawn path that doesn't set `element` → defaults to
  KINETIC (safe). Grep every `pool.get(`/`.fire`/`spawn` site that creates a
  damaging projectile.

---

## Phase E2 — Player→enemy resistance wiring

**Goal:** enemies resist / are weak to elements. "Bring the right element" starts
to matter.

**Files**
- `js/modules/combat/combat-manager.js` — in the canonical enemy-damage entry
  (`applyDamageToEnemy(enemy, damage, opts)`), multiply `damage` by
  `elementalMultiplier(enemy.resist, opts.element || bullet.element)`. Burn ticks
  (`applyBurn` path) pass their source element so DoT also respects resist.
- `js/modules/combat/collision-system.js` — hit paths pass `element` through to
  `applyDamageToEnemy`.
- Damage-number floaters — dim/small on resisted, bright/large on weak, an
  "IMMUNE" cue at 0 (reuse existing floater system).

**Acceptance**
- A VOLT weapon visibly hits harder vs a Volt-weak enemy, softer vs a
  Volt-resistant one; immune shows 0 + cue.
- Unit test: damage scales by the resist map through `applyDamageToEnemy`.

**Risks**
- Every damage source must thread an element (default KINETIC). Nova/beam/AoE
  paths included.

---

## Phase E3 — Status engine expansion (enemy side)

**Goal:** add the new statuses beyond BRN/STUN/SLOW, mirroring the existing
timer pattern.

**Mechanics (locked starting values — tune in playtest)**

| Status | Effect | Stacks | Duration |
|---|---|---|---|
| **CORRODE** | target takes +15%/stack from ALL sources | 3 | 4s, refresh |
| **CHILL** | movement ×0.6 | 1 | 2s |
| **FREEZE** | full halt + `brittle`; a hit ≥ threshold SHATTERS | — | 1.5s |
| **CONDUCT** | +50% Volt taken; chain +1 | 1 | 3s |
| **OIL** | next Pyro hit triggers a flare | 1 | 5s |
| **MARK** | homing-priority + crit + loot | 1 | 6s |
| **BLEED** | DoT, faster ticks than BRN, no refresh | 6 | 4s |

**Files**
- `js/modules/enemy/enemy.js` — add reset fields near 233-241 (`corrodeStacks/
  corrodeUntil`, `chillUntil`, `freezeUntil`+`brittle`, `conductUntil`,
  `oilUntil`, `markUntil`, `bleedStacks/bleedUntil/bleedTickAt`). Extend
  `_processStatusEffects()` (1445) for CORRODE read, FREEZE gate (mirror the stun
  gate at 434/539 + set brittle), BLEED ticks.
- `js/modules/combat/combat-manager.js` — new helpers beside `applyBurn`/
  `applyStun`/`applySlow` (1884+): `applyCorrode`, `applyChill`, `applyFreeze`,
  `applyConduct`, `applyOil`, `applyMark`, `applyBleed`.
- `js/modules/hud/status.js` (or in-world) — small status icons over enemies.
- `js/modules/world/particle.js` — frost, corrode, mark, oil-sheen particles.

**Acceptance**
- Unit tests per status (tick counts, stack caps, refresh, gating). CORRODE
  amplifies subsequent damage; FREEZE halts movement + firing.
- Status icons render only on enemies with an active status.

**Risks**
- Per-frame cost → gate the status walk on "has any status." Pause timers when
  the game is paused (mirror BRN's existing pause handling).

---

## Phase E4 — Synergy reactions (the combos)

**Goal:** wire set-up→pay-off so weapons combine.

**Reactions**
- **OIL + Pyro hit** → flare: AoE burn to neighbors within R, consume OIL.
- **CONDUCT + Volt** → +50% damage and chain +1 (read in the Volt damage calc).
- **FREEZE + hit ≥ threshold** → SHATTER: AoE damage + re-apply FREEZE to
  neighbors. Hard cap chain depth (mirror Nova chain's 3-hop ceiling).
- **CORRODE** → already a universal multiplier (E3); nothing extra.
- **MARK** → consumed by homing target-selection + crit roll + loot drop.

**Files**
- `js/modules/combat/collision-system.js` — reaction checks at the hit site.
- `js/modules/game-engine.js` / `combat-manager.js` — shatter/flare spawn helpers
  (reuse Nova-style ring FX + `triggerHitstop`/`triggerScreenShake`).

**Acceptance**
- Each combo visibly fires in playtest; shatter chains and stops at the cap;
  oil flare spreads to neighbors.
- Unit test: trigger conditions + chain-depth cap.

**Risks**
- Recursion explosion → per-spawn hop counter, hard ceiling.

---

## Phase E5 — Enemy→player resistance + player statuses (two-way completion)

**Goal:** enemy attacks are elemental; the player resists and can be afflicted.

**Files**
- `js/modules/enemy/enemy-bullet.js` — enemy projectiles carry `element` (from
  the enemy's `element`, or per-pattern override).
- `js/modules/player/lifecycle.js` — in `takeDamage()` (69), after dodge/REFLEXES
  and around the shield calc (112), multiply incoming damage by
  `(1 - player.getElementResist(opts.element))`. On a hit, roll the attack's
  status onto the player (player-side burn DoT, chill = reduced thrust, corrode
  = +damage taken, etc.).
- **NEW player status fields** + a `player.updateStatusEffects()` step (player.js
  update) + player status HUD (status.js).

**Acceptance**
- A fire enemy's hit burns the player (visible), reduced by Pyro resist; chill
  slows the player's thrust briefly.
- Player resist affixes (E7) measurably reduce elemental damage taken.

**Risks**
- Player-side statuses can feel unfair → keep durations short, no stun-lock on
  the player. Cleanse hook for the **Second Wind** skill (Skills plan S5).

---

## Phase E6 — Weapon element identity (apply statuses)

**Goal:** each weapon applies its element's signature status; the per-weapon
STUN/KNOCK upgrade trees re-theme into element-flavored procs.

**Mapping (apply-on-hit)**
- Pyro→BRN, Cryo→CHILL (heavy hits FREEZE), Volt→CONDUCT + chance SHOCK,
  Toxic→CORRODE + poison BLEED, Void→MARK + pull, Radiant→shield/armor pierce +
  PURGE (strips a buff/Conduct).

**Files**
- `js/modules/combat/weapon-data.js` — element + per-weapon status proc config.
- `js/modules/player/weapons.js` / `collision-system.js` — apply the status at
  hit using the E3 helpers.

**Acceptance**
- Each weapon visibly applies its status; element labels show in shop/HUD.

**Risks**
- Applying statuses changes effective DPS → retune proc rates / weapon damage.

---

## Phase E7 — Item resistance affixes

**Goal:** items can roll per-element resistance, making the two-way loop matter
for gear.

**Files**
- `js/modules/world/item-names.js` — add resist affixes to `ITEM_AFFIX_POOL`
  (one per element + a rare `allResist`), with `getItemAffixTotal('pyroResist')`
  etc. feeding `player.getElementResist`.
- `js/modules/ui/inventory-overlay.js` — display resist affixes.

**Acceptance**
- Equipping a Pyro-resist item reduces fire damage + burn taken.

**Note:** this is the foundation slice; the full 8-tier ladder + trait class is
the **Item Tiers, Resistances & Traits** plan.

---

## Phase E8 — Enemy retrofit + first elemental / anti-meta types

**Goal:** make the roster speak elements; add types that exercise the system.

**Files**
- `js/modules/enemy/enemy-data.js` — apply the §7.1 resist/element/archetype
  retrofit to the 10. Add **Cinder** (Pyro swarm), **Glacier** (Cryo tank),
  **Tesla Wraith** (Volt teleporter), **Warden** (anti-meta: resists the last
  element that hit it).
- `js/modules/wave/wave-data.js` — spawn integration.
- enemy AI/render for the new types.

**Acceptance**
- Stages demand element-switching; the Warden visibly shifts its resistance to
  the last element used against it.

**Risks**
- Wave balance + new-type AI cost. Ship 2-3 types first, expand later.

---

## Cross-cutting

- **Testing:** unit tests per status + resist math (both directions) + synergy
  triggers; the AI 2-minute survival run is the regression gate after each phase.
- **Performance:** status walk gates on "has any status"; reuse existing pools/FX.
- **Versioning (CLAUDE.md):** each phase ≥1 MINOR, own commit. This doc is
  non-versionable.
- **README:** update once E6/E8 land (elements as a system; enemy roster).

## Open questions

1. Resist value bands — confirm −0.75…+0.90 range and `1.0 = immune`?
2. Should KINETIC have *any* resist interactions, or stay the universal
   "always 1.0" baseline? (Recommend baseline.)
3. SHATTER threshold — fixed value or % of frozen enemy max HP?
