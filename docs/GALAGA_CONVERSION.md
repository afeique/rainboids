# Rainboids → Galaga: Conversion Report

A design proposal for turning Rainboids' free-flight roguelite into a fast,
synchronized arcade shooter that still uses the existing entity, movement,
and upgrade machinery — just rewired around formations, sorties, and flow.

---

## 1. The Core Pivot

Today the game is **free-flight + asteroid-belt + roguelite shop between waves**.
The shop is the wave gate; XP/Gold are spent on a stacking upgrade tree.

Galaga is **bottom-locked ship + top-formation + dive sorties + score + 1-up**.
It has no shop. Tension comes from formation pressure and dive timing, not
from build-crafting between rounds.

The conversion shouldn't try to be Galaga literally — Rainboids has 10
distinctive enemies, weapon switching, and skills that Galaga never had.
The right target is a **"Galaga-shaped Rainboids"**: arcade-paced, formation-
driven, no menus mid-run, with the existing roster repurposed as roles in
a synchronized squadron.

### Frame
- Player still flies a ship (keep current controls — they were just tuned).
- Free 2D movement is preserved, **but the playfield is biased**: enemies
  enter from off-screen top in a coordinated formation, the player operates
  in the lower 40% of the field. Asteroids drift through as obstacles.
- Wave structure is replaced by **stages**: each stage is a scripted spawn
  script (a "sortie") of 30–90 seconds. No shop transitions break flow.

---

## 2. The Upgrade Problem

You correctly identified that the shop interrupts flow. Three options were
considered. Recommendation in bold.

### Option A — Keep the shop, make it instant
Pop a 3-card pick at end of stage, 2-second display, no browsing. Cheap
to implement (we already have all the upgrade definitions in
`weapon-data.js` and `shop-manager.js`). But it still breaks pace and
still asks the player to read.

### Option B — **Drop the shop entirely. Use in-flight pickups + milestone perks.** ✅
This is what fits a Galaga clone. Two-pronged system:

1. **Powerup pickups drop from kills** (we already have this skeleton in
   `js/modules/world/powerup.js`). Make them the primary source of build
   variety. They're **instant, visible, and apply mid-fight** — pure flow.
2. **Milestone perks** trigger at score thresholds (every 10k pts: pick 1
   of 3, displayed on a 1.5s overlay that does NOT pause the game). The
   player keeps flying while choosing — pick with number keys 1/2/3 or
   click. If they don't pick in time, a default is chosen. This preserves
   build identity without stopping the action.

Pickups become the new "shop." Drops should be **typed and color-coded** so
the player learns at a glance:

| Drop | Effect | Source |
|---|---|---|
| Red orb | +1 Rapid Fire stack (caps at 5) | any kill, ~6% |
| Blue orb | +1 Multi Shot pellet | kills in formation, ~4% |
| Green orb | Heal 25 / +max if full | Guardian/Sentinel kills |
| Yellow orb | Brief 5s overdrive (1.5× DMG, 2× fire rate) | Wasp/Stalker kills |
| Purple orb | Re-roll: drop your next pickup as 2 random | Tangerine/Drifter kills |
| Gold ingot | +500 score | combo finishers |

This **maps every existing enemy archetype to a dropped behavior** so the
roster naturally diversifies the loot stream. No menu, no decision paralysis.

### Option C — Hybrid: pickups + 1 deep-meta layer between *runs*
Best long-term. Pickups govern the in-run build (Option B). Between **runs**
(after death/victory), a small persistent meta unlocks new starting
weapons, stage variants, or starting perks. This is the Galaga "cabinet
high score" replaced with light progression. SP becomes the meta currency,
gold becomes per-run only.

**My recommendation: ship Option B first, layer C in once the loop feels right.**

### What happens to XP / SP / Gold

- **Gold** → Becomes pure **score**. Displayed top-right. Drives milestone
  perks (every 10k = perk pick) and final run grade. No mid-run economy.
- **SP** → Becomes **meta currency** banked across runs (Option C). Earned
  per-stage based on combo, accuracy, no-hit bonuses. Spent on the
  out-of-run unlock screen — *never* during play.
- **XP** → If currently distinct from gold, fold it into score. One number
  is easier to optimize against and matches arcade idiom.

---

## 3. Synchronized Wave Design (the heart of Galaga)

The current `wave-data.js` is a flat enemy-count list per wave. Replace with
a **sortie script** model:

```js
STAGE_3: {
  name: "Crossfire",
  duration: 60_000,
  formationEntry: 'two_columns_swirl',   // how the squadron flies in
  formation: [                           // resting layout (top of screen)
    {type:'GUARDIAN', slot:[0,0]},
    {type:'GUARDIAN', slot:[1,0]},
    {type:'STALKER',  slot:[0,1]}, ...
  ],
  sorties: [                             // scripted dives over the stage
    {at: 8_000,  ids:[2,5],   pattern:'pincer_dive'},
    {at: 18_000, ids:[0,1],   pattern:'sweep_left'},
    {at: 30_000, ids:[3,4,6], pattern:'spiral_bomb'},
    ...
  ],
  asteroidStream: { every: 4_000, lane: 'random', count: 1 },
}
```

### Reuse what already exists
- Movement patterns in `js/modules/enemy/movement.js` are *exactly* what's
  needed for sorties — `triangleMovement`, `spiralBurstMovement`, `arcMovement`,
  `zigzagMovement`, `knightMovement`, `swarmMovement`, `wavyMovement`,
  `cardinalGridMovement` already give us a 15+ pattern library. Galaga
  itself only had ~4. We're starting **rich**.
- Asteroids stay as drifting hazards/loot (great Rainboids signature).
- Enemy AI's `evasion`, `dodgeBullets`, `fishMotion` get **disabled while in
  formation** and **enabled during dive** — same enemies, two modes. Cheap.

### Formation entry choreography (the "Galaga feel")
On stage start, the squadron flies in along a **scripted Bezier path** in
groups of 3–6, looping/spiraling, then **snaps into formation slots** at the
top of the screen. They breathe (slow 3px sway) until their dive trigger.
This is the iconic Galaga moment and it's pure choreography — no AI logic.

### Dive patterns (per archetype, plays to existing shapes)
- **HUNTER / WASP** → fast cross-screen sweeps, fire on descent
- **GUARDIAN / SENTINEL** → slow heavy dives, stay longer, spread shots
- **STALKER** → fixed-laser strafes from formation (don't dive, beam-snipe)
- **DRIFTER / WEAVER** → spiral dives, area denial as they fall
- **PROWLER** → missile barrage from formation, no dive
- **TANGERINE** → kamikaze runs, drop mines on retreat
- **TITAN** → boss stage every 5 stages; **tractor-beam steal** mechanic
  (Galaga's signature) — if it grabs you, defeating it next stage
  returns your ship as **dual-fighter mode** (literally `MULTI_SHOT +1` and
  doubled hitbox; we already have this pipeline).

Mapping enemies to roles makes the roster feel intentional instead of
generic.

---

## 4. Pacing & "Fast"

What makes a Galaga clone *feel* fast:

1. **No dead air.** First enemy on screen <1.5s after stage start.
   Formation entry overlaps with the previous stage's last dive.
2. **Constant ranged threat from formation** while diver(s) close in. The
   player can never just sit still — formation is firing down at them.
3. **Short stages, escalating tempo.** 30s → 45s → 60s → 30s boss. Don't
   let any stage outstay welcome. Current 100-wave structure should
   collapse to ~30 stages with much higher per-stage density.
4. **Combo meter.** Kills within 1.5s of each other extend a combo. Combo
   x5 doubles drop rates, x10 gives a free overdrive. **This is where
   "stack upgrades to mow hordes" gets satisfying** — high combos turn
   pickups into pickup-cascades.
5. **Screen-clear bombs as a finite resource.** Map current `NOVA_BLAST`
   power weapon onto a 3-charge bomb. Restock from rare drops. Galaga had
   no bombs but every modern arcade shooter does, and it gives the player
   a panic button that doesn't trivialize the run.

### Player feel: "precise and powerful"
- Tighter hitbox on the ship (already done — controls were tuned 2026-04).
- **Bullet visibility pass**: enemy bullets brightened, player bullets
  thinned. Galaga bullets are 2x4 pixels and that's part of why it's
  readable. Today our bullets are richer-looking but visually noisier.
- Keep the existing weapon switch system as a **mid-run powerup**: each
  primary weapon becomes a temporary 15-second pickup. No permanent
  loadout choice (that's a meta-progression decision). Encourages
  experimenting in-flight.

---

## 5. What to Cut, What to Keep

### Cut
- `shop-manager.js`, `shop-dom.js`, `shop-renderer.js` — entire shop layer.
  ~1.5k LOC. Replace with a 100-LOC milestone-perk overlay.
- Wave-end pause and "WAVE COMPLETE" full-stop in `wave-manager.js`. Stages
  flow into each other with a 1.5s banner only.
- The 30+ purchasable stack upgrades in `weapon-data.js` shop items. Move
  the *effects* into the pickup table; delete the cost/stack bookkeeping.
- Per-wave health restoration. In Galaga you carry damage forward (well,
  you die in 1 hit — we should keep an HP bar but not full-heal between
  stages, only on green-orb pickup or extra-life milestone).

### Keep
- All 10 enemy types and their movement/firing behaviors. Repurposed.
- Asteroid system as ambient hazard.
- Particle/debris/color-star polish — it's the project's signature.
- Player physics, weapons, skills (as time-limited pickups).
- `combat-manager`, `collision-system`, all pools. No engine work needed.

### Add
- `js/modules/wave/sortie-script.js` — stage script runner (timeline +
  formation + dive trigger).
- `js/modules/wave/formation.js` — slot grid, breathing, dive request.
- `js/modules/world/pickup.js` — promote from current `powerup.js` to be
  the primary build-influence layer with 6+ typed drops.
- `js/modules/ui/milestone-perk.js` — non-blocking perk picker overlay.
- `js/modules/combat/combo.js` — combo meter, drop-rate multiplier.

---

## 6. Suggested Implementation Order

1. **Sortie script + formation slots** for one stage. Get the entry
   choreography feeling right with placeholder enemies. (1–2 days)
2. **Plug existing 10 enemies into formation roles**, dive triggers wired
   to existing movement patterns. (1 day)
3. **Pickup overhaul**: 6 typed drops, color-coded, instant-apply. Delete
   shop. (1 day)
4. **Combo meter + score consolidation** (XP/Gold → Score). (½ day)
5. **Milestone perk overlay** (non-blocking, 3-pick). (½ day)
6. **30 hand-authored stage scripts** replacing 100-wave data. This is
   where the *design* work lives — formation arrangements and dive
   timings are the game. (3–5 days, iterative)
7. **Boss stage every 5: TITAN with tractor beam.** (1–2 days)
8. **Meta-progression layer** (Option C), if the loop sings. (later)

Steps 1–5 are the playable conversion (~5 days). Step 6 is where it
becomes a real game.

---

## 7. Risks / Open Questions

- **Free-flight vs bottom-lock.** True Galaga locks the player to the
  bottom. We'd lose a lot of Rainboids' identity if we did that. Proposal
  is to keep free 2D movement but bias spawn/pressure to top — confirm
  that feels right in prototype. If not, soft-lock the player to the
  lower 50% with a subtle slowdown above that line.
- **Asteroids' role.** They make sense as drifting hazards but could
  clash visually with formations. May want sparser asteroid streams in
  formation stages, dense streams in dedicated "asteroid stages" as
  breather rounds.
- **Skills (BULWARK, PHASE_DASH, etc.)** — keep them or fold into
  pickups? Recommendation: keep 1 equipped defense skill on a cooldown,
  no choice mid-run. Choice happens in meta layer.
- **30 stages enough?** Galaga loops; we could loop with a +1 difficulty
  modifier after stage 30. Or generate stages 31+ procedurally from the
  hand-authored pool (we already do this for waves 101+).

---

## TL;DR

- **Drop the shop.** It kills flow. Replace with typed pickup drops
  (instant, color-coded, mapped per enemy archetype) plus a non-blocking
  milestone-perk picker every 10k score.
- **XP/Gold collapse to a single Score.** SP becomes meta currency for
  out-of-run unlocks (later).
- **Replace 100 waves with ~30 sortie-scripted stages.** Formation entry
  + scheduled dives, using existing movement patterns. Stages flow into
  each other; no full stops.
- **Reuse the entire 10-enemy roster** by giving them formation roles and
  archetype-tied dive behaviors. Today's `movement.js` already has more
  patterns than Galaga ever did.
- **Add combo meter + screen-bomb** for the "powerful" feel; tighten
  bullet visibility for the "precise" feel.
- Build it in this order: formation/sortie engine → pickup overhaul →
  combo+score → 30 stage scripts → TITAN boss → meta progression.
