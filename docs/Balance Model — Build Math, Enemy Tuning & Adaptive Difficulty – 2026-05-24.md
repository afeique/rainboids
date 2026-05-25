# Balance Model — Build Math, Enemy Tuning & Adaptive Difficulty
*2026-05-24 — for review. Companion to the Energy/Health + Abilities brainstorm docs. Quantitative model for the **no-downsides** direction. Numbers are from source (see refs); assumptions are flagged ⚠.*

## Method & the core problem
Damage and survivability are best modeled as **multipliers over a baseline**, because absolute per-shot numbers are small and the real scaling comes from the *build*, not player level. Define:
- **Offense PPI** (Player Power Index) = base primary DPS × (all damage/fire-rate/crit multipliers).
- **Defense EHP** = max HP × damage-reduction × dodge × lives, plus sustain (regen/lifesteal/bloodshield) as EHP-per-second.

The **central finding** that drives everything below: **the same enemy takes wildly different time-to-kill depending on build** (see §3 — a Wave-20 elite is ~35 s for a min build, ~3.5 s for a designed build, ~1.2 s for a synergy god). Static enemy HP **cannot** serve that spread. With downsides removed, the top end climbs further. **⇒ Adaptive difficulty isn't a nicety; it's the only thing that keeps both ends of the build spectrum fun (§6).**

---

## 1. Baseline numbers (from source)
**Player start:** HP 40 (max +35/stack ×10 → **390**); shield 15% DR (+8%/stack ×8 → cap **75%**); dodge cap **50%**; **~4 lives** (3 tanks + active); base crit **8% @ ×2.0**; base fire 400 ms.
**Standard primary DPS ≈ 3.0** (PULSE 1.2×2.5, STORM 0.4×7.7, SCATTER 2.1×1.43 all ≈3.0). Outliers: CLUSTER ≈62, FLAK ≈9 — treated separately.
**Energy:** max 100, regen 8.33/s (12 s fill). Power costs 20–65; power damage is **low per-hit but AoE** (NOVA 4 over r320, ORBITAL 15, SINGULARITY 9) → power DPS ≈ damage × enemies-hit / (cost ÷ regen).
**Enemies (base HP):** Hunter/Wasp/Weaver/Cinder 4–5 · Stalker/Frost-Lance 7 · Drifter/Lumen 9 · Sentinel/Tangerine/Glacier 10–18 · Guardian 12 · Prowler/Hydra/Spore 13–14 · Warden 16 · **Titan 20**. **Contact damage 25** (all), level-scaled.
**Enemy scaling (wave→mult):** HP `1 + t·8 + t^2.5·6.5` → **W1 ×1.0, W10 ×4.1, W20 ×7.5, W30 ×15.5** (t=(w−1)/29). Speed ×0.55→1.75, bullet speed ×1.15→**3.05**. Boss HP tier ×4–8 on top. ⚠ Contact-damage scaling (`getLevelScaledDamage`) not captured exactly — **assume ×~2–4 by W30**; verify.

---

## 2. The multiplier stacks (no-downsides era)
### Offense (×over base DPS) — these now stack with NO drawback
| Source | Mult | Type |
|---|---|---|
| Crit (base 8%@2.0) → maxed (50%@2.9) | ×1.08 → **×1.95** | avg |
| RAPID_FIRE (≈5 stacks, −12%/stack interval) | **×1.86** | fire rate |
| GLASS_CANNON (now pure) | ×1.6 | keystone |
| GUNSLINGER (primary) | ×1.5 | keystone |
| PURIST | ×1.4 | keystone |
| FRENZY (full crowd) | ×1.8 | conditional |
| SIEGE (full, stationary) | ×1.6 | conditional |
| Bloodlust (full) | ×1.3 | conditional |
| OPPORTUNIST / VENDETTA / TRACER_LOCK | ×1.15 / ×1.3 / ~×1.3 | conditional |
| CONDUCT (Volt) / CORRODE (3 stk) | ×1.5 / ×1.45 | status |
| OVERFLOW_SPARK→powers (full energy) | ×1.25 | energy |

**Composite offense PPI:** early **×1–2**, designed mid **×6–10**, **stacked god build ×25–40** (e.g. 1.95·1.86·1.6·1.8·1.6·1.15 ≈ ×24, before status/element). Reaction builds push higher via AoE-on-many.

### Defense (×EHP)
| Source | Effect |
|---|---|
| HEALTH_BOOST ×10 | HP ×9.75 (40→390) |
| Shield 15→75% DR | EHP ×1.18 → **×4.0** (1/(1−DR)) |
| DODGE 50% | EHP ×2.0 (avg) |
| ~4 lives (tanks) | ×4 |
| Regen 3/s · Vampirism 25% · Bloodshield | sustain (EHP/sec) |

**Composite max EHP** ≈ 390 · 4 · 2 · 4 ≈ **~12,000 effective HP** + heavy sustain → a maxed tank is **near-unkillable** against current contact damage (25 × ~×3 ≈ 75/hit). This is R0/R2 made concrete.

---

## 3. Build pressure-tests (TTK / TTD, quantitative)
TTK = enemy HP ÷ player DPS. TTD = player EHP ÷ enemy DPS-on-you. **Target bands:** trash TTK 0.4–1.5 s · elite 3–6 s · boss 20–40 s; TTD ≥ several seconds of sustained fire (never one-shot; never unkillable).

**Reference enemy:** Wave-20 Prowler (base 14 HP × 7.5 = **105 HP**); contact ≈ 25 × ~3 = **75/hit** ⚠.

| Build | Offense PPI | DPS (×3) | TTK on 105 HP | EHP | TTD @75/hit | Verdict |
|---|---|---|---|---|---|---|
| **Min / off-build** | ×1.5 | 4.5 | **23 s** ✗ too slow | ~200 | ~3 hits | under-powered (but progression prevents this) |
| **Spellslinger** (energy) | ×8 (powers AoE) | ~24 eff + AoE | ~2–4 s (AoE clears crowds) | ~600 | ~8 hits | ✓ good *if powers tuned (R1)* |
| **Crit Assassin** | ×14 | 42 | **2.5 s** ✓ | ~500 | ~7 hits | ✓ on-target |
| **Glass Nuke** | ×30 | 90 | **1.2 s** ⚠ trivializes | ~250 | ~3 hits | too strong vs HP / fragile-ish |
| **Vampire Bruiser** | ×9 | 27 | 3.9 s ✓ | ~3,000 +25% lifesteal+bloodshield | **~40+ hits** ✗ unkillable | tanky to a fault (R2) |
| **Swarm Commander** | drones ~×6 | ~18 + pets | ~5 s | ~700 | ~9 hits | ✓ *if drone DPS tuned* |

**Read-out:** with one shared HP value (105), a *designed* build sits in-band, the **god build trivializes** (1.2 s) and a **maxed tank is unkillable** (40+ hits). The spread between Glass Nuke and Min build is **~20× TTK**; between Bruiser and a squishy build is **~10× TTD**. **No single enemy stat can be "balanced" for all of them** — hence §6.

---

## 4. Tuned buff numbers (concrete, implementation-ready)
*Tuned so a single source is meaningful but not absurd, and full stacking lands in the ×25–40 offense / heavy-EHP range the difficulty system is built to meet.*

### Energy stats (SP)
- **Capacitor:** +15% max energy / pt, **5 stacks → +75%** (100 → 175).
- **Reactor:** +12% regen / pt, 5 stacks → +60% (8.33 → 13.3/s; fill 12 s → 7.5 s).
- **Efficiency:** −6% power cost / pt, 5 stacks → −30%. **Global cost-reduction hard cap −50%** (Efficiency + `energyCost` affixes + Resonance-ineligible) so powers never trend free outside the Overclock keystone.

### Energy gear affixes (wave-scaled like existing)
- `maxEnergy` base +8/pt · `energyRegen` +3%/pt · `energyCost` −2%/pt (rare, capped per item; feeds the −50% global cap).

### Health
- **Regeneration stat:** +0.4 HP/s / pt, 5 stacks → +2.0/s (shares the 3.0 cap; an in-combat-regen powerup can raise the cap to ~5/s for a dedicated build).
- **Bloodshield:** each lifesteal heal adds to an ablative shield; **decay 2.5% max HP/s**, **cap 35% max HP**. (At 25% lifesteal + 30 DPS dealt = 7.5 HP/s in vs 2.5%·390≈9.75/s decay at cap → steady ~20–30% buffer while fighting; collapses ~5 s after you stop dealing damage.)
- **Bloodlust:** +2%/stack, **cap +30%**, decays 3 s after the last heal.
- **Sanguine Engine:** kill heals **4% max HP**, overkill **×2**.
- **Vampirism stat** unchanged (5%/stack ×5 = 25%); `vampirism` affix unchanged.

### OVERFLOW_CAPACITOR
- 2× regen, +50% max energy. No downside.

### Power weapons (R1 — the load-bearing tune)
- Power per-hit damage must scale so an energy build's **sustained AoE DPS ≈ a designed primary build's single-target DPS × ~1.3** (the reward for the AoE/setup). ⚠ Concretely: at ~13/s regen, a 45-cost Nova fires every ~3.5 s; to reach ~30 effective DPS hitting ~6 enemies it needs ~17 ring damage (currently 4). **Roughly ×3–4 power damage**, OR have power damage inherit a share of the player's offense multipliers (cleaner — then powers ride the build like primaries do). **Recommend: route power damage through the same `getPassiveDamageMult`/crit pipeline as primaries** so energy builds scale with the kit instead of needing bespoke numbers.

---

## 5. Enemy toughness targets (what the curve must become)
Goal: keep a **designed build's** TTK in-band at each wave; let adaptive difficulty (§6) handle off-builds.

Designed-build DPS ≈ 3 × PPI(wave), with PPI growing ~×1 (W1) → ×6 (W10) → ×10 (W20) → ×14 (W30) as the build comes online.
Target trash TTK ≈ 1 s ⇒ **required trash HP ≈ DPS**:
| Wave | Designed DPS | Target trash HP (≈1 s TTK) | Current trash HP (Hunter 5×) | Gap |
|---|---|---|---|---|
| 1 | 3 | ~3 | 5 | ~ok |
| 10 | 18 | ~18 | 20 | ~ok |
| 20 | 30 | ~30 | 37 | ~ok |
| 30 | 42 | ~42 | **78** | HP a bit high for designed, but **far too low for a ×30 god build** (TTK 0.3 s) |

**Takeaways:**
- For the **designed** build the *current* HP curve is roughly fine (slightly high at W30).
- For the **god** build it's *way* too low (everything melts). For the **min** build it's too high. ⇒ Don't chase a single curve; set HP for the *designed* build and let **§6 multiply it by the player's measured power**.
- **Boss budgets:** at tier ×8 + level scale, W21+ bosses already sit ~600–1200+ effective HP for designed builds (≈20–40 s) — in-band; god builds need the §6 multiplier or bosses pop in <10 s.
- **Contact/threat:** with EHP reaching ~12k on tanks, raising raw contact damage to threaten them would **one-shot squishies**. ⇒ threat must scale on a **separate axis keyed to the player's EHP/skill** (§6), not a flat global bump.

---

## 6. Adaptive Difficulty — the system the no-downsides direction requires
**Principle:** the player is *meant* to feel strong; difficulty adapts by giving a strong player **more and tankier targets** (so they get to *use* their power), and only gently raises *threat* so they're tested without feeling cheated. Two independent controllers:

### Signals (measured on a rolling window, e.g. last 2 waves)
- **Clear speed** — actual wave-clear time vs. a target (the primary offense signal).
- **DPS-on-target** — rolling damage/sec dealt (proxy for offense PPI; smooths out "no targets" lulls).
- **HP stability** — fraction of max HP retained; hits taken/wave; tanks consumed (the defense signal).
- **Dodge/graze rate & streak** — skill proxies.

### Two controllers (per-wave, smoothed — never per-frame, to avoid rubber-band whiplash)
1. **Power-match `D_hp` (enemy HP × count):** drives TTK toward target.
   `D_hp ← clamp( D_hp · (TTK_actual / TTK_target)^−0.5 , 0.7, 3.0 )`
   (clears too fast → raise HP/count; struggling → lower). Bias the *response* toward **count** at the low/mid end (more things to mow — feels powerful) and **HP** at the high end (chunkier elites — avoids screen-flooding).
2. **Threat `D_thr` (enemy damage / density / bullet-speed):** drives TTD toward target.
   `D_thr ← clamp( D_thr · (TTD_target / TTD_actual)^−0.4 , 0.6, 2.0 )`
   Tank builds (huge TTD) → raise threat so they're still tested; squishy builds → lower so they're not one-shot. **Cap threat-per-hit at a fraction of current max HP** (reuse FAILSAFE's "≤50% max HP" idea as a global floor) so no adapted hit one-shots.

### Feel & guardrails
- **Bias to challenge, not punishment:** ~70% of adaptation rides on HP/count (offense outlet), ~30% on threat. The fantasy stays "I'm strong"; the test is "there's *so much* to kill, and the elites bite."
- **Bounds** prevent degeneracy: even a god build caps at D_hp 3.0 / D_thr 2.0 (a real but beatable wall); even a weak build floors at 0.7/0.6 (hard but not hopeless).
- **Smoothing:** move D at most ~15%/wave; bosses read the *current* D at spawn and lock it for the fight.
- **Surface it honestly (optional):** a subtle "Threat Level" readout so escalation reads as earned, not random.
- **Re-uses the deterministic curve as the *floor*:** §5's wave scaling is the baseline; D multiplies on top. A player on the designed curve sees D≈1.0 and never notices the system.

### Why two axes (not one global "difficulty")
A single multiplier can't reconcile **Glass Nuke** (needs more HP, but is fragile → must NOT get more threat) with **Vampire Bruiser** (needs more threat, but already one-shots trash → must NOT get more HP). Decoupling **how-fast-you-kill** from **how-fast-you-die** is what lets *every* build land in its fun band — which is the whole point of allowing unlimited, downside-free power.

---

## 6b. Adaptive difficulty — refined spec (v2)

### Per-axis Player-Power Estimates (replace single signals)
Each controller reads a **composite, normalized estimate** so it's robust to lulls (no targets ≠ weak) and spikes:
- **Offense `Po`** = `0.6·(rolling DPS-on-target ÷ expected-DPS-for-wave) + 0.4·(target-clear-time ÷ actual-clear-time)`. `Po > 1` ⇒ over-performing.
- **Defense `Pd`** = `0.6·(avg HP-retained fraction) + 0.4·(hits-survived-this-wave ÷ expected-hits)`. `Pd > 1` ⇒ over-tanky.
- Rolling window: **EMA over the last ~2 waves** (α≈0.4) — long enough to be stable, short enough to track a build coming online.

### Controllers (per-wave update, not per-frame)
```
# deadband: ignore small deviations so D doesn't churn
if |Po − 1| > 0.10:  D_hp  ← clamp( D_hp  · Po^0.5 , 0.7, 3.0 )
if |Pd − 1| > 0.10:  D_thr ← clamp( D_thr · Pd^0.4 , 0.6, 2.0 )
# rate limit: never move a controller more than 15% in one wave
# cross-term (true mastery): only let threat reach its ceiling when BOTH high
if Po > 1.3 and Pd > 1.3:  D_thr may climb toward 2.0 ; else cap D_thr ≤ 1.4
```
- **Cold start:** D_hp = D_thr = 1.0 for waves 1–2 (collect data); adapt from wave 3.
- **Exponents** (0.5 / 0.4) are gentle on purpose — full correction over ~2–3 waves, never instant. Tune from telemetry.

### What each controller actually pulls (lever order)
- **`D_hp` (offense outlet — "give me more to kill"):** ① enemy HP ×, ② spawn **count** ×, ③ **elite/affix injection** (armored/shielded/fast variants). Bias to **count** at D_hp ≤ ~1.5 (feels powerful — mow them down), shift to **HP + elites** above that. **Hard density ceiling** (screen/perf): once count caps, *all* further pressure becomes elites/HP, never more trash.
- **`D_thr` (challenge — "make me respect them"):** ① enemy contact/bullet **damage** ×, ② **bullet density/pattern** complexity, ③ **spawn cadence** (less downtime). **Per-hit cap: no single hit > 50% current max HP** (global FAILSAFE-style floor) so adaptation never one-shots a squishy.

### Flow band (mercy ↔ escalation)
- **Mercy:** ≥2 deaths/tank-pops on a wave → ease *both* axes ~20% next wave (anti-frustration), decaying back as the player stabilizes.
- **Escalation:** a wave cleared with full HP in < 60% target time → bump D_hp (and, if `Pd` also high, D_thr) — the stomp gets answered.
- Target is the **"challenged but winning" channel**, not a knife's edge; bias slightly toward *letting the player feel strong* (≈70% of total adaptation budget rides D_hp/count, ≈30% D_thr).

### Bosses & legibility
- **Boss-lock:** a boss reads current D_hp/D_thr **at spawn** and holds them for the fight (no mid-fight rubber-band). Boss HP = base tier × D_hp; boss threat = base × D_thr (per-hit cap still applies).
- **Threat-Level readout (subtle):** a small 1–5 "Threat" pip derived from `(D_hp+D_thr)/2`, so escalation reads as *earned*, not random. Optional but recommended.
- **Telemetry:** log Po/Pd/D each wave (ties into the existing "fun score" tooling) to tune bounds + exponents against real play.

### Why composite + cross-term matters (the failure it prevents)
A **Glass Nuke** clears fast (`Po` high) but is fragile (`Pd` ≈ 1): the system raises `D_hp` (more/tankier targets to nuke) but **leaves `D_thr` alone** — so it isn't punished for being squishy. A **Vampire Bruiser** barely clears faster than designed (`Po` ≈ 1) but never dies (`Pd` very high): the system raises `D_thr` (real threat) but **leaves HP alone** — so it isn't drowned in trash it already one-shots. Only the **true god build** (both high) gets both ceilings. One global knob cannot do this; the decoupled composite can.

---

## 6c. Keystone identity in a no-downsides game (incl. Glass Cannon)
Removing downsides means a keystone can't be *defined by its drawback* — it must be defined by **the build it unlocks**. The "fragility" of a glass-cannon playstyle is **emergent from the equip economy** (all-offense slotting, no defense), not an imposed penalty. So:
- **Glass Cannon (RESOLVED): merge with Berserker's Pact** → one keystone: **"+40% damage, scaling up to +90% as current HP falls."** Pure upside, name stays literal (rewarded for fighting on the edge), removes a redundant low-HP keystone, **frees a keystone slot.** *(Alt: rename to a flat "Devastation" keystone and let the glass playstyle stay emergent.)*
- **General rule for the ex-downside keystones:** re-anchor each to a build —
  - GUNSLINGER → +primary damage & fire-rate (anchors primary/Crit builds); the "no powers" was never the point.
  - PURIST → flat damage + pierce (anchors Projectile Trickster).
  - FRENZY → +per-nearby-enemy (anchors Glass Nuke crowds).
  - FAILSAFE → reused as the **global per-hit cap** in §6b (it becomes a *system* safety net rather than a player keystone) — or keep as a defensive keystone with the cap as pure upside.
  - TWIN_CAST → "powers fire twice (2nd at 50%)" (anchors Spellslinger), cost penalty gone.
  - HEAT_SINK → uncapped fire-rate ramp + vent **as an AoE reward**, no lockout.

---

## 7. Open items / honest caveats
- ⚠ **Verify three inputs I assumed:** `getLevelScaledDamage` contact-damage curve; whether power damage rides the player damage pipeline; exact multiplier stacking (additive vs multiplicative per source). The PPI ranges shift if these differ — but the *structural* conclusion (huge build spread → need adaptive difficulty) holds regardless.
- **Sequencing:** build the kit (additive + downside removals) → re-tune §5 enemy HP for the *designed* build → ship §6 adaptive difficulty → playtest the extremes (min build & god build) and tune the D bounds. §6 is the longest pole.
- **Power-weapon viability (R1)** and **tank viability (R2)** from the companion doc are *subsumed* here: R1 = "route powers through the damage pipeline + ×3–4 base"; R2 = "Bloodshield/Sanguine make tanking a playstyle, and D_thr keeps it honest."

---

## 8. Fun-tuned targets — grounded in psychology
*The numbers below are picked for **engagement/addictiveness**, not just balance. Each cites the principle it serves.*

- **Flow channel (Csikszentmihalyi):** keep the player succeeding most moment-to-moment engagements while *feeling* tested. Translate to: **~1–2 near-death moments per RUN**, not per wave; an in-channel build clears most waves without dying but has occasional "phew." The adaptive band is tuned to *produce* that cadence, not a knife's edge.
- **Popcorn TTK (instant gratification — the Vampire Survivors / Halls of Torment loop):** trash **0.4–0.8 s** TTK. Dopamine comes from kill **volume + spread**, so favor MANY fast kills over few spongy ones. **Bullet-sponge trash is the #1 anti-pattern** — never let trash TTK climb above ~1.5 s even for weak builds (the adaptive floor enforces this). Elites **3–5 s**; bosses **30–60 s** (a setpiece, sized to the ~20–30 min run).
- **Adaptive targets WAVE TIME, not per-enemy TTK** *(key reframe / a correction to §3's framing):* target **active-combat wave time ≈ 35 s** (rhythm: build → crescendo → ~5 s breather → escalate). A god build faces a **swarm** (same ~time, epic spectacle); a weak build faces a **trickle**. This is why the spread that matters is **relative-to-designed throughput**, capped — not the absolute 20× from §3.
- **Variable-ratio reinforcement (Skinner — the slot-machine, the most addictive schedule):** **crit is the per-hit pull.** Sweet spot **25–50% crit** (frequent enough to feel, random enough to crave); base 8% is too rare to be exciting → crit investment should reach ~50% fast. Crit damage in **clean multiples** (×2.0 base → ×3.0+ invested). Drops/orbs tuned so a "big find" is a *surprise*, not a metronome.
- **Loss aversion / near-miss (the strongest single dopamine spike in action games):** Bloodshield + death-saves + the per-hit cap manufacture "barely survived" moments. Target **~1 near-miss per 1–2 waves** in-channel — engineered by the mercy/escalation band, not RNG.
- **Weber–Fechner JND:** a stat increment must be **≥~10–15%** to be *felt*. ⇒ **fewer, chunkier stacks** beat many tiny ones. (+5%/stack reads as "did that do anything?"; +15% reads as "oh, nice.") This retunes some per-point values in §10.
- **Escalating spectacle (hedonic treadmill):** rewards must visibly grow — kill-streak tiers, bigger screen-clears, the Threat-Level pip. The adaptive "more to mow" feeds the need for escalating spectacle without raising frustration.
- **Legibility:** round, reasoned numbers (+50%, ×2, 25%) — players remember and plan around them; "+47%" adds cognitive friction for no benefit.

**Concrete adaptive targets (v3):**
| Param | Value | Why |
|---|---|---|
| `target_wave_time` | **35 s** active | flow rhythm; long enough to feel, short enough to "one more" |
| `target_trash_TTK` | **0.7 s** | popcorn dopamine |
| `target_HP_retained`/wave | **60%** | get chipped, not chunked → near-miss cadence |
| Crit sweet-spot | **25–50%** @ ×2.0→×3.2 | variable-ratio feel |
| `D_hp` bounds | **[0.6, 3.0]** | + count [0.6, 2.5] + elite-inject ≤+50% → covers ~0.6–7.5× throughput demand |
| `D_thr` bounds | **[0.6, 1.8]** | 1.8 (not 2.0) — per-hit cap + cross-term make 1.8 plenty; 2.0 felt punishing |
| per-hit cap | **45% current max HP** | loss-aversion headroom; never one-shots |
| D move rate | **≤12%/wave** | smooth, sub-perceptual; no rubber-band whiplash |
| Deadband | **±12%** | kills churn around target |
| Near-miss target | **~1 / 1.5 waves** | engineered tension |

---

## 9. Extreme stress tests + adaptive verification
**Framing fix:** normalize to **T = throughput relative to the *designed* build at that wave** (designed = 1.0) and **S = survivability relative to designed**. The realistic spread is **T ≈ 0.15–3.5**, **S ≈ 0.4–4.0** — *not* the absolute 20× (that conflated absolute PPI with relative). Wave time ≈ `35 s × (stuff ÷ T)`, where `stuff = D_hp × count × elite` (adaptive can reach ~7.5×, floor ~0.36×).

| Build | T | S | → D_hp / count / D_thr | Wave time | Survivability | Verdict |
|---|---|---|---|---|---|---|
| **Designed (control)** | 1.0 | 1.0 | 1.0 / 1.0 / 1.0 | ~35 s | occasional near-miss | ✓ system invisible (D≈1) |
| **Average generalist** | 1.1 | 1.0 | 1.0 / 1.0 / 1.0 | ~32 s | comfortable | ✓ never notices the system |
| **Synergy God (both high)** | 3.5 | 3.0 | 2.5 / 1.4 / 1.8 (cross-term unlocks threat) | ~35 s **epic swarm** | takes real hits, survives | ✓ god-like *and* tested |
| **Glass Nuke (no dodge)** | 3.0 | 0.5 | 2.2 / 1.4 / **~0.8** (Pd low ⇒ threat NOT raised; mercy if dying) | ~35 s, tons to nuke | fragile *by choice* — a mistake still kills | ✓ carried by offense, not punished for squish |
| **Pure Tank (low dmg)** | 0.7 | 4.0 | **0.7** / 0.8 / **1.8** | ~35 s **trickle of tanky threats** | ground out; threat-capped, never one-shot | ✓ tank viable, not trivial |
| **Struggling / min @ high wave** | 0.4 | 0.4 (dying) | floor 0.6 / 0.6 / 0.6 + repeat-death ease | long but survivable | hard, not hopeless | ⚠ genuine edge — see coverage note |

**Controller dynamics (stressed):**
- **Build coming online:** T spikes 1→3 over ~waves 8–12 as a synergy snowballs. D ramps ≤12%/wave ⇒ lags ~2 waves ⇒ the player enjoys a brief **stomp** before the system catches up. **This lag is a feature** — it's the dopamine reward for nailing a synergy. ✓
- **Oscillation:** EMA(α 0.4) + ±12% deadband prevent thrash when T/S wobble wave-to-wave. ✓
- **Reckless glass cannon:** high T (⇒ more targets) but repeated deaths ⇒ mercy eases D_thr; they're *carried by offense*, and the threat the system adds is gentle — but their **self-chosen fragility** still kills them on bad dodges (the emergent downside doing its job). ✓
- **Boss-lock:** boss reads D at spawn; god build's boss = high HP, capped threat ⇒ a ~40–60 s setpiece, not a 10 s pop. ✓

**Honest coverage limit:** the adaptive system fully equalizes **T ≈ 0.6–3.5** (≈ the middle ~90% of builds) into the 35 s flow channel. **Above ~3.5** it deliberately lets you feel god-like (fast, epic clears) rather than walling you — *that's the reward*, not a gap. **Below ~0.6** at a high wave it can't fully rescue you — but that state is prevented by progression + the meta-stat floor + the mercy band. **This is intentional asymmetry**, documented so we don't "fix" it later by flattening the god-build reward.

---

## 10. Stats & powerups — locked values, build spreads, average-player profiles

### Per-point stat values (JND-checked: every increment is *felt*)
| Stat | Per pt | Stacks | Total | Note |
|---|---|---|---|---|
| Crit Chance | +7% | 6 | 8→**50%** | hits the variable-ratio sweet spot |
| Crit Damage | **+20%** | 6 | 200→**320%** | bumped from +15 → juicier crit pop (clean-ish) |
| Health | +40 | 10 | 40→**440** | rounded from 35; chunky |
| Toughness | +8% DR | 8 | 15→**75%** cap | keep |
| Vampirism | +5% | 5 | →**25%** | keep (feeds Bloodshield/Bloodlust) |
| Dodge | +5% | 10 | →**50%** cap | keep |
| Speed | +16% | 4 | →**+64%** | keep — movement is king |
| **Regeneration** *(new)* | +0.4/s | 5 | →**+2.0/s** | shares 3.0 cap (5.0 with the in-combat powerup) |
| **Capacitor** *(new)* | +15% | 5 | →**+75%** max E | felt per point |
| **Reactor** *(new)* | +12% | 5 | →**+60%** regen | felt |
| **Efficiency** *(new)* | −6% | 5 | →**−30%** cost | global cost-reduction cap **−50%** |
| Thorns | — | — | **rework** | flagged dead-pick (R6); re-theme to "reflect applies a status / nova" |

### Best vs worst-case spreads (the variance IS the dopamine)
Variable-ratio reward means a build's *best moment* should noticeably out-shine its *average* — that surprise is the hook. Representative single-engagement spreads:
- **Crit Assassin:** worst (no mark, crit unlucky) vs best (marked full-HP elite + Predator auto-crit + Vendetta + Tracer ramp all live) ≈ **~4–5× burst**. ✓ big lucky-crit highs.
- **Status Reactionist:** bad positioning (few enemies) vs ideal (packed crowd, Catalyst+Detonator chain) ≈ **~3× clear**. ✓ rewards setup.
- **Vampire Bruiser:** low-DPS lull (shield decays) vs high-DPS dive (Bloodshield maxed + Bloodlust stacked) ≈ **~2× damage + near-invuln**. ✓ rewards aggression.
- **Spellslinger:** empty meter vs full + Overflow Discharge free-empowered cast ≈ **~2.5× burst**. ✓ rewards timing.
- *Design rule:* keep best/worst within **~2–5×** — enough to thrill, not so swingy it feels random/unfair.

### Average-player profiles (guesses — for tuning the "invisible" middle)
1. **Generalist (most common):** spreads SP across HP/damage/crit, picks powerups that "sound good" with shallow synergy, dodges okay. **T≈1.0, S≈1.0** → sits dead-center; the adaptive system is invisible. *This is who the §5 enemy curve is tuned for.*
2. **Defensive Turtle:** over-invests HP/toughness/regen, light damage, cautious. **T≈0.6, S≈3.0** → adaptive thins targets (fewer to kill) + adds threat they can eat; slow but safe and playable. (Don't let their wave time exceed ~50 s — the floor handles it.)
3. **Aggro Masher:** all damage, skips defense, mediocre dodging → an *accidental* glass nuke. **T≈2.5, S≈0.5** → carried by offense, threat eased, but their own fragility bites on bad plays (emergent downside). High highs, occasional splats — addictive.
4. **Synergy Hunter (experienced, ~10% of players):** deliberately chases a combo, snowballs toward the god build. **T→3.5** → the escalation/cross-term gives them the epic-swarm payoff. This is the player the depth is *for*.

**Takeaway:** ~80% of players live in profiles 1–3 (T 0.6–2.5), which the adaptive band fully serves; the system exists mostly to (a) stop bullet-sponge frustration at the low end and (b) reward — not punish — the synergy hunters at the top.
