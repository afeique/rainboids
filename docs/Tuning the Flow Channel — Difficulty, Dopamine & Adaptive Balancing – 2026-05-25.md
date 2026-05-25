# Tuning the Flow Channel
### How a bullet-hell tries to keep *everyone* on the edge of their seat — the design, the brain science, and the math

*A design article from the Rainboids team, 2026-05-25.*

> **Read me first — what this is, and what it isn't.** This is a **design article about systems we are building right now**, not a victory lap for finished features. Some of it is already running in the game (the adaptive "Director" took its first breaths this week); some of it is still ink on the whiteboard (the player-power score, the procedural wave-builder, the big "no-downsides" combat rework). Even the parts that *run* are running on **placeholder numbers** — educated guesses we haven't earned yet. **Nothing here is proven.** Every figure is a starting hypothesis, and the only thing that will tell us whether the magic actually works is a *lot* of playtesting — robot bots grinding survival runs and real humans yelling at their screens. Treat this as a map of where we're trying to go, not a postcard from having arrived.
>
> **How to read it (two tracks in one).** The main text is written for anyone — no math required. Wherever real numbers live, they're tucked into clearly-marked **`🧮 For the number-curious`** boxes you can skip entirely without losing the plot. Skip them and you get the story; read them and you get the spreadsheet.

---

## A cold open

You're at 4% health. A lattice of enemy bullets is closing like a fist. You jink left, thread a gap the width of your ship, and come out the other side — and somewhere in your skull a little firework goes off. You will chase that firework for the next twenty minutes.

That feeling is not an accident, and it's not magic. It's *engineerable* — and what's wild is that the same firework has to go off for the cautious newcomer creeping through Wave 3 **and** for the veteran who has built a glass cannon that deletes the screen. Those two players could not be more different. Giving them the same thrill from the same game, at the same moment, is the entire problem this article is about.

> **Quick vocabulary** (skip if you live here):
> **Bullet-hell** — a shooter where the screen fills with dodgeable enemy fire. **ARPG / roguelite** — you build a character out of randomized loot and powers, and a "run" is one attempt. **Build** — your particular stack of weapons, abilities, and upgrades. **TTK / TTD** — Time To Kill an enemy / Time to Die yourself. **DPS** — Damage Per Second. That's the whole dictionary.

---

## 1. The problem, in one sentence

**In a game where your power can multiply almost without limit, no single difficulty setting can fit everyone — because the *same enemy* can take one player twenty times longer to kill than another.**

That's not hyperbole; it's roughly the real number. A brand-new build chips an enemy down in twenty-odd seconds (agony). A well-designed build does it in a couple seconds (good). A min-maxed monster does it in about one (trivial). One enemy, the same health bar, three completely different experiences — and we deliberately make this *worse*, because the most fun builds come from letting powers stack with no downside (more on that gleefully reckless choice later).

So we can't hand-place a difficulty curve and call it done. The curve has to **watch you and adapt.**

> **🧮 For the number-curious — where "20×" comes from.**
> We model power as multipliers over a baseline. *Offense (PPI, Player Power Index)* = base DPS × every damage/fire-rate/crit/keystone multiplier. Worked from real values, a stacked build reaches roughly **×24** (e.g. crit ×1.95, rapid-fire ×1.86, and three damage keystones ×1.6/×1.8/×1.6, all multiplying together) — before elemental reactions even join in. *Defense (EHP, Effective Health Pool)* = max HP × damage-reduction × dodge × lives, which climbs from ~200 to a roughly-12,000 near-unkillable tank.
> Pressure-test one enemy — a Wave-20 foe at **105 HP** — across builds: min build ~**23 s** to kill, designed build ~**2.5 s**, glass nuke ~**1.2 s**. That ~**20× spread** is the *absolute* range, and it's the shock that motivates everything here. (Hold onto the word "absolute" — in §5 we'll show the spread the system actually has to *flatten* is far tamer once we measure each build against the "designed" yardstick instead of against zero.)

---

## 2. The loops, and how long each should last

A game like this is really a set of nested clocks, each ticking at its own speed, each doing a different job for your brain. Get the *durations* right and the whole thing breathes; get them wrong and it either drags or panics.

| The loop | How long it should take | What it's secretly doing |
|---|---|---|
| **A hit landing** | a blink — 0 to ~130 ms | "Yes! You connected." (confirmation) |
| **A kill (TTK)** | trash **½–1 s**, elite **3–5 s**, boss **30–60 s** | the little payoff — fast and frequent beats fat and rare |
| **A wave** | **~35 s** of action | a phrase of music: build → crescendo → breath → repeat |
| **A run** | 20–30 min, with **~1–2 near-death scares** | the story you'll retell to a friend |
| **The long game** | many runs | your character getting permanently, satisfyingly stronger |

Two of these clocks do most of the heavy lifting.

**Kills should feel like popcorn.** Quick, plentiful, faintly addictive. If a basic enemy takes more than a second or so to die it stops reading as "weak thing I crushed" and starts reading as "bullet sponge" — the single most reviled texture in the genre. So the joy at this layer comes from *volume and variety* of kills, not from any one beefy target.

**We pace the wave, not the enemy.** Here's the subtle trick: we don't aim for a fixed kill-time per enemy — we aim for a roughly **35-second wave**, long enough to feel like something happened, short enough that you immediately want *one more*. A monster build experiences those 35 seconds as a glorious *swarm* (hundreds of popcorn kills, fireworks everywhere). A weak build experiences them as a tense *trickle* (a handful of scary foes). Same clock, opposite feeling. That's the goal: not "everyone kills at the same speed," but "everyone gets a satisfying 35-second wave."

And your **abilities** — the big cooldown-gated moves — are the punctuation marks. We even feed kills back into them (kill something, shave a little off your cooldowns), so playing aggressively *buys* you more big moments. Momentum rewards momentum.

---

## 3. Why those timings feel good: a quick tour of your own brain

This is the fun part, because the timings above aren't arbitrary — they're tuned against how the brain actually keeps score. A few greatest hits from psychology and neuroscience, each with the game-design lesson attached.

**Your brain only celebrates surprises.** Neuroscientist Wolfram Schultz showed that dopamine — the "reward" chemical everyone misnames as the pleasure molecule — actually tracks **prediction error**: it spikes when something is *better than expected*, shrugs when things go exactly as predicted, and dips when they're worse. The surprise $20 in an old coat pocket beats the salary you knew was coming. **Lesson:** a perfectly predictable reward stops feeling like a reward at all. So we design every build to have a *best moment* that noticeably out-shines its average — a lucky crit chain, a perfectly-positioned chain reaction — because the variance *is* the dopamine.

**The slot machine is the most engaging schedule ever found, and we borrow exactly one gear from it.** B.F. Skinner catalogued how reward *timing* changes behavior, and the winner — the pattern that produces the most relentless engagement and is hardest to quit — is the **variable-ratio** schedule: a reward after an unpredictable number of tries. That's a slot machine. Our (much gentler) version is the **critical hit**: tune it so it lands often enough to feel, rarely enough to crave (roughly a 25–50% chance, big satisfying number when it pops). You pull the trigger partly because *this* shot might crit.

**The near-miss is a cheat code for excitement.** Luke Clark's brain-imaging work on gamblers found that *near-misses* — the slot reels stopping one cherry short — light up **overlapping win-related circuitry** and crank up the urge to keep going, even though a near-miss is, objectively, a loss. Our near-miss is "I was at 4% and I *lived*." It's the strongest single jolt the genre offers, so we don't leave it to luck — we **manufacture** it: a rule that no single hit can take more than ~45% of your current health means death always arrives as a *survivable scare*, not a one-shot cliff. We're aiming for roughly one of those "phew" moments every wave or two.

**Losing stings about twice as much as winning delights — so we deleted the downsides.** This one (from Kahneman & Tversky's loss aversion) quietly drives a big design choice. A power-up that reads *"+60% damage, −50% health"* is poison: the −50% *feels* worse than the +60% feels good, so nobody touches it and a cool build dies unborn. So in the combat rework we're building, **every upgrade is pure upside.** "Fragility" still exists — a glass cannon is squishy — but as an *emergent* consequence of how you spent your limited slots (all offense, no defense), not as a punishment stapled to a card. Scarcity does the balancing that penalties used to.

**The new-car smell always fades — so the spectacle has to keep growing.** Psychologists call it the **hedonic treadmill**: we adapt to any steady level of reward and drift back to baseline. A reward that always maxes out quietly stops mattering. The antidote is *escalation you can see* — bigger screen-clears, climbing kill-streak tiers, a rising threat meter — which is also why our adaptive system, when it decides you're too strong, mostly responds by giving you *more to kill* (more spectacle) rather than *more pain*.

**You can't feel a tiny change — so we stopped making tiny upgrades.** The **Weber–Fechner law** says the smallest change you can notice scales with the size of the thing: you won't feel the thermostat drop 1°, but you'll feel 5°. A "+5% damage" upgrade reads as *"...did that do anything?"* So we deal in chunky, round, *legible* numbers — +50%, ×2, 25% — fewer upgrades that each actually land.

**And the master frame over all of it: flow.** Mihály Csikszentmihályi's famous "optimal experience" lives in a channel between boredom (too easy) and anxiety (too hard). Think of a surfer on the face of a wave: too slow and you sink, too steep and you wipe out, and the ride is the line between. *Every* number in this article is, ultimately, a bid to keep you on that line.

```
            high │ A N X I E T Y
                 │  (too hard — you panic and tilt)
   challenge     │        ╲╲
   (enemy        │          ╲╲   F L O W
    pressure)    │            ╲╲  ← the ride lives here
                 │              ╲╲
                 │   B O R E D O M  ╲╲
            low  │   (too easy — you yawn)
                 └────────────────────────────────
                   low          skill          high
```

> **A word on the obvious comparison.** Yes, these are the same levers that make slot machines and loot boxes compulsive. We're not going to pretend otherwise. The difference between *engaging* and *exploitative* isn't the lever — it's the intent and the guardrails, and we come back to that honestly in §9. The short version: these tricks should make a game that's *already fun* more fun. Bolt them onto a hollow game and you get resentment, not joy.

---

## 4. How strong are you, really? The Power Level score

For the game to adapt to you, it first has to *measure* you with a single number. We're building that number — call it **PWR** — and the most important design decision is that it's **multiplicative across three legs**, not additive.

Picture a three-legged stool: **Offense** (how hard you hit), **Survival** (how long you live), and **Utility** (everything else — abilities, support powers). Multiply the legs together and the **shortest leg caps the whole stool.** A glass cannon with monster damage but tissue-paper defense is *not* a high-PWR build, no matter how big its numbers — because its survival leg is stubby, and multiplying by a stubby leg keeps the total low.

That's not a quirk; it's the entire point. It means the game won't look at a fragile one-trick build, see the huge damage, and throw a meat grinder at someone who'll die in one hit.

> **🧮 For the number-curious — the PWR formula and a worked example.**
> `PWR = K · Offense^0.45 · Survival^0.35 · Utility^0.20`, with `K` set so a fresh starter ≈ **100**. The fractional exponents are the "stool legs": a weak axis can't be fully bought off by a strong one. *Offense* ≈ effective DPS (damage × fire-rate × multishot × crit-expectation × reach). *Survival* ≈ `maxHP ÷ (1−damage-reduction) ÷ (1−dodge)` + a few seconds of sustain. *Utility* ≈ ability potency + passive value + energy economy.
> Three builds at Wave 20, using **illustrative** axis multiples (×N over a starter) to show the shape — not derived figures:
>
> | Build | Offense | Survival | Utility | → PWR |
> |---|---|---|---|---|
> | Designed | ×8 | ×6 | ×3 | ≈ **595** |
> | Glass Nuke | ×30 | ×1.3 | ×2 | ≈ **583** |
> | Synergy God | ×30 | ×8 | ×5 | ≈ **1,320** |
>
> Look at the middle row: the Glass Nuke has *nearly four times* the designed build's offense, yet lands at essentially the **same PWR (583 vs 595)** — its near-zero survival leg cancels the damage. Only the Synergy God, strong on *every* leg, breaks away (≈**2.2×** the designed build, ≈2.3× the equally-hard-hitting glass nuke). The math refuses to over-rate a one-dimensional build — exactly what we want.
>
> *Status:* PWR is **designed but not yet wired in.** The live Director (next section) currently steers off *measured performance* — how you actually did last wave — with this score intended as the "pre-load" that lets it brace for a strong build *before* the first punch lands.

---

## 5. The Director: a thermostat for fun

Here's the system at the heart of it all, and the one that's newly **alive in the game** (if wobbly and uncalibrated): the **Adaptive Difficulty Director.**

Think of it as a thermostat. A thermostat doesn't ask you to pick a furnace setting in BTUs; it reads the room and nudges. The Director reads *how your last wave went* — did you finish at full health or limping? did you clear fast or grind? did you nearly die? — folds that into a single "are you comfortable or sweating?" reading, and gently nudges the enemies up or down to keep you in that flow channel.

The two cleverest things about it:

**It pushes on two separate knobs, not one.** A single "difficulty" dial is hopeless here, because opposite builds need opposite things. The reckless glass cannon needs *more stuff to shoot* (it's drowning in targets to nuke) but absolutely must **not** get hit harder (it's fragile by choice — punishing that is just mean). The unkillable tank is the mirror image: it needs *real threat* to feel tested, but piling on more trash it already one-shots does nothing. So the Director splits the job: one knob for **"how much is there to kill"** (enemy health and numbers) and a separate knob for **"how much can it hurt me."** Decoupling those two is what lets *every* build find its own comfortable-but-tested groove.

**It eases off faster than it ramps up.** When you're cruising, it tightens the screws slowly and politely. When you're drowning, it backs off *fast* — because a frustrated player spiraling toward a death needs relief now, while a dominating player can be squeezed at leisure. Kindness is asymmetric on purpose.

And there's a deliberate piece of *generosity* baked in: when you finally nail a build and start stomping, the Director takes a beat to catch up. **That lag is a feature** — it's your reward for cleverness, a few glorious waves of god-mode before the game politely reasserts itself. We are explicitly *not* going to "fix" the moment where a great build gets to feel great.

> **🧮 For the number-curious — the control loop.**
> After each wave we compute a **pressure** reading `P ∈ [0,1]` (higher = you struggled): `P = 0.40·(1−hpLeft) + 0.25·dmgTaken + 0.20·(clearRatio/2) + 0.15·nearDeath`. Then we steer a `directorMult` to keep `P` inside the mode's target band `[Plo, Phi]`: too easy → multiply up by a small `UP_RATE`; too hard → multiply *down* by a larger `DOWN_RATE` (down beats up — the anti-spiral kindness); in-band → settle. Moves are capped at ~12%/wave so it never feels like rubber-banding, and it reads *clear speed relative to your own power* (an EMA — exponential moving average, i.e. a smoothed recent average — of performance), not a fixed clock.
> The output gets split across enemy knobs with exponents that sum to 1, so the product is exact: at a target enemyPower of 2.0, `HP ×2^0.5 ≈1.41`, `damage ×2^0.3 ≈1.23`, `count ×2^0.2 ≈1.15` — and `1.41·1.23·1.15 = 2.0` ✓. **HP gets the biggest slice on purpose:** more health is the *least punishing* way to add difficulty (it gives you more time to enjoy your power), whereas more damage just kills you quicker. Enemy *speeds* are capped and never scaled, so bullets always stay dodgeable.
>
> **A worked trace — a build coming online (Normal mode, band P∈[0.30, 0.55]):** A synergy clicks at Wave 9; you start clearing at full HP in half the expected time → `P ≈ 0.05`, way below the band → "too easy" → the multiplier climbs ~5%/wave for a few waves. Then the tougher enemies start to chip you: you end a wave at 60% HP, having taken some hits → `P ≈ 0.36`, back *inside* the band → it settles. New equilibrium: you finish waves around **60% health** — bloodied, not buried — with the near-miss cadence intact. The system did its job and went invisible.

> **🧮 The honest edges of the model.** The Director can fully equalize the *middle ~90%* of builds (those within ~0.6–3.5× of the designed build's throughput) into the 35-second channel. Note that's a far tamer spread than the scary "20×" from §1 — because once we measure relative to the designed build instead of relative to zero, most builds aren't actually that far apart. Two edges we leave *on purpose*: above ~3.5× we stop walling you and just let you feel god-like (that's the reward, not a bug), and below ~0.6× at a high wave it can't fully rescue a hopeless build — that's caught upstream by permanent progression and the mercy rule.

---

## 6. Numbers you can actually feel

Tying §3's brain science to the spreadsheet: upgrades come in **chunky, round, memorable** sizes so each one registers (Weber–Fechner) and you can plan around it (no "+47%" friction). Crit lands in a **25–50%** sweet spot for that slot-machine pull. A build's best burst is tuned to out-shine its average by **2–5×** — enough to thrill, not so swingy it feels random. And the **no-single-hit-over-~45%-of-your-health** rule means death is always a scare you *could* have survived, never a rug-pull. Round numbers aren't lazy; they're respect for the player's memory.

---

## 7. Why a kill has to *thwack*

None of the above survives contact with a *limp* kill. If shooting something produces no jolt, your brain has nothing to celebrate — the whole reward loop is built on feedback it can feel. So impact gets a coordinated little symphony: a freeze-frame, a screen shake, a flash, particles, a sound, knockback — scaled to how big a deal the moment is.

The craft here (well-trodden by Steve Swink's *Game Feel* and Masahiro Sakurai's hit-stop talks) is restraint: a freeze on *every* rapid-fire shot would feel like lag, so trivial hits get nothing and the drama is *saved* for the moments that earn it — a crit, a kill, and especially a boss going down, where you absolutely earned the dramatic pause. And critically, in a bullet-hell we **freeze the world, not the ship** — locking your movement for even a few frames mid-dodge is a death sentence. The juice serves the player; it never handcuffs them.

---

## 8. How we'll actually know if any of this works

Here's the humbling part, and the reason for all the hedging up top: **everything above is a hypothesis.** A tidy formula is a *prediction* about a human being, and humans have a habit of surprising tidy formulas. The numbers — the 35-second wave, the 60%-health target, the crit sweet spot, the Director's ramp rates — are starting guesses, not gospel.

So the real work is the proving, and it has two halves. First, **robot playtesters**: we run AI bots that mimic human imperfection (realistic aim wobble, reaction lag, panic when low, fatigue over a long session — a frame-perfect bot would tell us nothing useful) at a spread of skill levels, and score each run against a "fun" model built from the same flow/engagement research above. Second — and there's no substitute for it — **real people**, lots of them, telling us where it drags, where it cheats, where it sings. Only that loop of *guess → build → measure → re-tune*, run many times, turns these hypotheses into a game. We are at the very start of that loop, not the end of it.

---

## 9. The line we hold

Let's be straight about the uncomfortable thing: this article is a tour of the exact psychological levers that make slot machines and loot boxes hard to put down — unpredictable rewards, near-misses, prediction-error dopamine, loss aversion. Pretending otherwise would be a lie.

The difference we're chasing isn't the absence of those levers — it's *intent and guardrails*. The schedules are here to make a genuinely good loop **more fun**, not to substitute for fun that isn't there (a distinction the field's own behavioral-design pioneers, like John Hopson, have spent years insisting on). So: no pay-to-win, no manufactured urgency, no dark patterns. The adaptive system is **transparent** — you can see your power and the threat level, so when the game ramps it reads as *earned*, not arbitrary. Rewards are tied to *real* difficulty you actually faced, so there's nothing to cheese. And the game eases off faster than it pushes. The aim is to use what we know about the brain to make the game **more fun — not harder to put down.** If we ever catch ourselves optimizing for the second thing, we've lost the plot.

---

## 10. Where this actually stands (as of this writing)

To keep ourselves honest, here's the real status — because a design article that quietly implies everything works is just marketing:

- **Running in the game, but uncalibrated:** the two-knob adaptive Director and its on-screen threat meter took their first breaths this week. They *work*; their target numbers are placeholders we haven't earned.
- **Designed, not yet built:** the Power Level score that lets the Director brace for a strong build *before* the fight; the procedural wave-builder that will compose fresh waves to a budget instead of replaying scripted ones; and the big **"no-downsides" combat rework** that widens the build spread this whole system exists to tame.
- **Shipped and solid:** the boss roster and the impact/feedback layer that makes all of it *thwack*.
- **The long pole:** calibration. None of the tuning numbers here have survived contact with a thousand real runs yet. That's the next mountain, and it's the one that matters.

Consider this a postcard from the middle of the climb. Check back when we've actually tuned it — and when we have, the proof won't be in this document. It'll be in whether you reach for "one more run."

---

## References (all free to read)

**Flow & difficulty**
- Csikszentmihályi, *Flow* — overview: https://en.wikipedia.org/wiki/Flow_(psychology) · free-to-borrow: https://archive.org/details/flowpsychologyof2008csik
- Chen, *Flow in Games* (thesis PDF): https://www.jenovachen.com/flowingames/Flow_in_games_final.pdf
- Hunicke & Chapman, *AI for Dynamic Difficulty Adjustment ("Hamlet")*: https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf
- Sweetser & Wyeth, *GameFlow* (PDF): https://eprints.qut.edu.au/58216/15/JournCT-GameFlow.pdf
- Schell, *The Art of Game Design* — GDC slides: https://web.cs.wpi.edu/~rich/courses/imgd4000-d10/lectures/schell-GDC09.pdf

**Reward, dopamine & the brain**
- Schultz, *Updating dopamine reward signals* (prediction error): https://pmc.ncbi.nlm.nih.gov/articles/PMC3866681/
- Skinner reinforcement schedules: https://www.simplypsychology.org/schedules-of-reinforcement.html
- Clark et al., *Gambling near-misses recruit win-related brain circuitry*: https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/
- Hopson, *Behavioral Game Design*: https://www.gamedeveloper.com/design/behavioral-game-design

**Behavioral economics**
- Kahneman & Tversky, *Prospect Theory* (loss aversion, PDF): https://kahneman.scholar.princeton.edu/sites/g/files/toruqf3831/files/kahneman/files/prospect_theory.pdf
- Diener, Lucas & Scollon, *Beyond the Hedonic Treadmill* (PDF): https://labs.psychology.illinois.edu/~ediener/Documents/Diener-Lucas-Scollon_2006.pdf
- Weber–Fechner law / just-noticeable difference: https://en.wikipedia.org/wiki/Weber%E2%80%93Fechner_law

**Motivation & game feel**
- Przybylski, Rigby & Ryan, *A Motivational Model of Video Game Engagement* (PDF): https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf
- Swink, *Game Feel: The Secret Ingredient*: https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient
- Nijman, *The Art of Screenshake* (video): https://www.youtube.com/watch?v=AJdEqssNZ-U
- Sakurai, *Eight Hit Stop Techniques* (video): https://www.youtube.com/watch?v=tycbMSjDDLg

*Internal sources (design docs, in `docs/`): the 2026-05-24 Balance Model (PPI/EHP, the two-knob Director, fun-tuned targets); Passive Skills & Run Difficulty §13–§14 (Power Level, control loop, reward scaling); QA Bot – Quantify Fun (the fun-score model); Hitstop Research (game feel).*
