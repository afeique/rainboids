# Gold Drop Overhaul — Brainstorm

Companion to the 6.16.1 immediate tuning (which skews the shape/pixel
split toward pixels). That fix solves the visual noise but the
underlying economy still has structural issues. This doc lays out
options for a deeper overhaul; pick one path or compose several.

---

## Diagnosis — what's actually wrong

Reading `combat-manager.js:dropOrbsFromEntity` line 808 onward, the
gold drop is the product of stacked multipliers:

```
baseMoneyDropRate = MONEY_ORB_BASE_DROP_RATE        (0.65)
                  + waveDropRateBonus               (wave-1) * 0.015
                  + levelDropRateBonus              (entityLevel-1) * 0.05
                  + enemyDropRateBonus              0.15 if enemy
moneyDropRate     = clamp(0.95, baseMoneyDropRate * goldFindMult * streakGoldMult)

budget            = baseCount(=1) * levelQuantityMult * enemyQuantityMult
                                  * hitStreakMultiplier * avgMoney
                                  * goldFindMult * streakGoldMult
budget            = clamp(MONEY_ORB_DROP_BUDGET_MAX=250, ...)
```

Five compounding multipliers (`gold-find`, `streak-gold`, `level-qty`,
`enemy-qty`, `hit-streak`) on top of linear wave scaling on `avgMoney`.
By wave 10 with PAYDAY/HIGH_ROLLER + a 10-kill streak the budget hits
the cap every drop. The cap silently swallows the upgrades.

### Symptoms players feel
1. **Drops all look the same in mid-late game** (visual at cap doesn't
   change with multipliers).
2. **Gold-find upgrades stop mattering** once budget pins at cap.
3. **The shop's gold sink doesn't track drop inflation** — late-game
   players are awash in gold; early-game players are starved.
4. **No "lucky" feeling** — no variance spike to chase.
5. **The shape pile** (the issue you just flagged).

### Symptoms players don't feel but matter
6. **Two parallel currency tracks** (shape value + pixel value) with
   no meaningful gameplay difference — both auto-collect via magnet.
   Pure visual difference.
7. **Health-orb and money-orb logic share a function** but have
   wildly different needs (cooldown vs no-cooldown, RNG curves vs
   flat). They're tangled.
8. **`isPixel` is the only differentiator** between coin and shape —
   no rarity tier, no special drop class.

---

## Option A — Replace stacked multipliers with one diminishing curve

Replace the multi-multiplier compounding with a single saturating
formula:

```js
const luck = 1
  + goldFindStacks * 0.20      // additive gold-find
  + streakBonus                // additive streak
  + waveBonus;                 // additive wave scaling
const budget = baseMoney * (1 - Math.exp(-luck * 0.5));
// → starts at ~baseMoney for luck=1, asymptotes toward ~baseMoney×2.5
//   at luck=10. Never hits the cap.
```

**Pros:** No more cap-swallowing. Every gold-find stack matters
forever. Predictable shape.
**Cons:** Players who built a "gold build" feel less godlike — the
linear power fantasy of "more multipliers = more gold" goes away.
**Effort:** ~30 lines change in `dropOrbsFromEntity`. PATCH.

## Option B — Drop tiers (bronze / silver / gold / platinum)

Each drop rolls a TIER based on budget:

| Tier | Budget range | Visual |
|---|---|---|
| Bronze | 1-50 | 4 pixels at 1-2g each, no shape |
| Silver | 50-150 | 1 small shape (white-gold) + 6 pixels |
| Gold | 150-300 | 1 mid shape (yellow-gold, glow) + 10 pixels |
| Platinum | 300+ | 1 large shape (cyan-tinted, sparkle ring) + 15 pixels |

Tiers are visibly distinct — the player learns to recognise their
own gold-find investment by the drops they're seeing. The DROP_BUDGET
cap becomes natural (Platinum is the cap) and meaningful.

**Pros:** Massive readability win. Cap stops being silent. Drops
finally feel like they have a "rarity".
**Cons:** Bigger code change. Need new render variants in
gold-shape.js (color/size/sparkle by tier). Need new SFX or audio
pitch shift on better tiers.
**Effort:** MINOR. ~150 lines across combat-manager + gold-shape +
sound-defs.

## Option C — Drop classes by enemy type

Instead of every enemy rolling the same drop logic, give each enemy
type a drop profile:

| Enemy | Drop profile |
|---|---|
| HUNTER (basic) | 80% pixel-only (4-6 pieces, ~30g) |
| WASP / STALKER (mobile) | 60% pixel scatter, 40% small shape (~80g) |
| GUARDIAN (tanky) | 1 chunky shape + small pixel scatter (~150g) |
| DRIFTER / PROWLER (rare) | 1 chunky shape + 10% chance: jackpot (+powerup or +health) |
| TITAN / boss | Guaranteed shape + 2-3 secondary smaller shapes + big pixel scatter (~350g, cap raised for bosses) |

**Pros:** Killing a boss FEELS different from killing a fly.
Currently they both produce identical visuals. Big design win.
**Cons:** Needs balance pass per enemy. Tightly couples enemy-data
and drop logic; refactor risk.
**Effort:** MINOR. Could be staged across 2-3 versions.

## Option D — Lucky streak meter / jackpot

Add a hidden "luck meter" that fills on each non-lucky drop and
empties when a JACKPOT drop fires. Jackpot = big shape with
particle ring + audio fanfare. Tied to a small RNG roll, but bad-luck
protection (BLP) guarantees a jackpot every N drops minimum.

**Pros:** Variance spikes feel great. BLP eliminates "I never see
gold" complaints. Cheap to implement.
**Cons:** Needs careful tuning to avoid feeling either too rare
(invisible) or too common (loses impact).
**Effort:** PATCH. ~50 lines in combat-manager + a new particle
effect.

## Option E — Shop sink scaling

Independent of drop changes, scale shop prices with wave so the
"gold per shop visit" equation stays in tension. Currently shop
prices are flat; late-game gold is essentially free.

```js
shopPrice = baseItemPrice * (1 + (wave - 1) * 0.08);
```

**Pros:** Solves end-game "I have 50k gold and nothing to spend it
on". Forces continued engagement with drops.
**Cons:** Changes how every existing shop interaction reads. Players
may resent late-game prices going up.
**Effort:** PATCH. One-line change in `shop-manager.buyShopItem`
plus UI display tweaks. But large playtest implication.

## Option F — Decouple gold-find from streak

Currently `goldFindMult × streakGoldMult` compound. Split them so:
- `goldFindMult` → applies to budget (more gold per drop)
- `streakGoldMult` → applies to JACKPOT chance, not budget

Then "streak" upgrades feel like jackpot enablers and "gold-find"
upgrades feel like steady-income builders. Different fantasy roles.

**Pros:** Clarifies build identity. Stops cap from being hit by
both inputs.
**Cons:** Requires Option D (jackpot) to exist.
**Effort:** PATCH (depends on Option D landing first).

## Option G — Strip the dual-orb system entirely

Replace gold-coin + gold-shape with ONE pool — a single GoldOrb
class whose size/glow/color/SFX scale with value. So:
- 1g drop = tiny dot
- 50g drop = small yellow orb
- 150g drop = chunky glowing gem
- 300g drop = huge cyan-tinted plasma sphere

One pool. One render path. One audio variant set with pitch shift.

**Pros:** Massive simplification. The current dual-pool design has
already-noted bugs (the cumulative-snap-acceleration bug appears
in BOTH pools). Halves the maintenance surface.
**Cons:** Bigger refactor. Loses the "shape vs pixel" texture that
some players might enjoy.
**Effort:** MINOR. ~200 lines across gold-coin + gold-shape +
combat-manager. Could fold the audit's "cumulative-snap" bug fix in.

---

## Recommended composition

If you want a single substantive overhaul (one MINOR commit), I'd
combine:

- **B (tiers)** for the readability win
- **D (jackpot + BLP)** for variance/feel
- **F (decouple gold-find from streak)** since D enables it
- **G (single orb pool)** as the simplification under it all

That's `Drops 2.0` and would take 4-6 PATCH-sized chunks of work,
shippable iteratively.

If you want minimal effort with maximum perceived improvement:

- **A** alone — saturating multiplier curve. ~30 LOC, eliminates
  the cap-pinning problem instantly, makes every gold-find stack
  matter again. Ships as a single PATCH.

If you want one thing that the player will NOTICE the most:

- **C** (per-enemy drop profiles). Killing a boss should not look
  the same as killing a grunt. Right now it does. This is the
  highest readability/feel return for medium effort.

---

## Other tunings worth bundling (small, low-risk)

- **Diminishing returns on `MONEY_ORB_BASE_DROP_RATE`** — currently
  0.65 + adders saturating at 0.95. The 95% drop chance means
  nearly every kill drops gold; gold-find feels like noise. Drop
  base to 0.45 and let multipliers reach 0.85.
- **Wave scaling exponent** — `(wave-1) × 3..5` is linear and
  eventually outpaces shop pricing. Use sqrt or log curve.
- **Hit-streak gold cap floor** — currently `min(1.4, 1 + 0.025n)`.
  Move the lower bound up so a 0-streak doesn't feel punished:
  `max(0.85, min(1.4, ...))` keeps drops near baseline when streak
  drops.
- **Health-money split** — the same RNG roll today decides health
  AND money for an enemy. Splitting them lets you tune each
  independently (e.g., bosses guarantee money but not health).
- **Pixel value scaling with wave** — even after 6.16.1 puts value
  in pixels, a "1g per pixel" floor means late-game pixel scatter
  is mostly cosmetic. Floor `pixelValueEach` at `max(1, floor(wave/5))`
  so the 30th-wave pixel coin is worth a real amount.

---

## Open question for you

Which path? I can implement **A** today as a small PATCH if you
want to see if the saturation curve alone fixes the feel. **B+C**
is the bigger swing if you want the system to actually feel
overhauled. **G** is the deeper structural cleanup.
