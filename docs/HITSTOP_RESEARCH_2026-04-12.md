# Hitstop / Hitfreeze Research for Rainboids

> Research compiled 2026-04-12. This document covers the mechanical implementation, design psychology, cross-game comparisons, and practical recommendations for adding hitstop to a 2D top-down space shooter.

---

## Table of Contents

1. [How Smash Bros Hitstop Works](#1-how-smash-bros-hitstop-works)
2. [Why It Works: Psychology and Game Feel](#2-why-it-works-psychology-and-game-feel)
3. [Cross-Game Comparison](#3-cross-game-comparison)
4. [Lessons for Rainboids](#4-lessons-for-rainboids)
5. [Anti-Patterns](#5-anti-patterns)
6. [Sources](#6-sources)

---

## 1. How Smash Bros Hitstop Works

### What Hitlag Is

Hitlag (Smash community terminology for hitstop) freezes both the attacker and the defender at the moment of impact. The attacker freezes on the frame their hitbox connected; the defender freezes on the first frame of their flinch/knockback animation while shaking in place. During hitlag, knockback has not yet begun — the defender is visually vibrating at the point of contact.

All Smash games run at a locked 60 fps, so 1 frame = 16.67 ms.

### The Formulas

**Super Smash Bros. 64 and Melee:**

```
hitlag = floor(floor(floor(d / 3 + 3) * e) * c)
```

Where:
- **d** = damage the attack deals (before staleness in Melee)
- **e** = electric multiplier (1.0 normally, **1.5** for electric-effect attacks)
- **c** = crouch cancel multiplier (1.0 normally, **0.667** if the defender is crouching)

**Super Smash Bros. Brawl and Smash 4:**

```
hitlag = floor(floor((d * 0.3846154 + 5) * h * e) * c)
```

Where:
- **h** = per-move hitlag multiplier (introduced in Brawl; allows designers to tune individual moves)
- Other variables same as above

**Super Smash Bros. Ultimate:**

```
hitlag = floor(floor(floor((d * 0.65 + 6) * h * e * s) * p) * c)
```

Where:
- **s** = stale/fresh damage modifier
- **p** = additional modifier (spirit effects, etc.)
- Cap: **30 frames** (500 ms) under normal conditions; attacking Kirby in Stone form applies a 1.2x multiplier *after* the cap, allowing up to **36 frames** (600 ms)

### Concrete Examples (at 60 fps)

| Attack Damage | Melee Hitlag | Brawl/Sm4sh Hitlag | Ultimate Hitlag |
|--------------|-------------|-------------------|----------------|
| 5%           | 4 frames (67 ms) | 6 frames (100 ms) | 9 frames (150 ms) |
| 10%          | 6 frames (100 ms) | 8 frames (133 ms) | 12 frames (200 ms) |
| 15%          | 8 frames (133 ms) | 10 frames (167 ms) | 15 frames (250 ms) |
| 20%          | 9 frames (150 ms) | 12 frames (200 ms) | 19 frames (317 ms) |
| 30%          | 13 frames (217 ms) | 16 frames (267 ms) | 25 frames (417 ms) |

**Key trend:** Hitlag has increased across the series. Melee has the least, Ultimate has the most. This reflects the series moving toward a more cinematic, impactful feel.

### Attacker vs. Defender

In the standard case, **both attacker and defender experience the same hitlag duration**. This is symmetric by default. The asymmetries come from:

- **Crouch canceling** (defender only): Reduces defender hitlag to 2/3, so the defender exits hitlag earlier than the attacker.
- **Perfect shielding** (Smash 4/Ultimate): The attacker suffers full hitlag while the defender gets **zero** hitlag, creating a punish window.
- **Projectiles**: Generally have reduced hitlag multipliers, so the attacker (who may be far away) is barely affected while the projectile and defender freeze briefly.

### What Continues During Hitlag

- The defender **vibrates/shakes** at the point of impact
- Stage elements, background animations, and particle effects typically continue
- In Ultimate, certain effects like Smash DI (directional influence during hitlag) allow the defender to subtly shift position before knockback begins

---

## 2. Why It Works: Psychology and Game Feel

### The Core Purpose: Selling Impact

Hitstop serves three simultaneous psychological functions:

1. **Confirmation**: The freeze tells the player "yes, you hit." In a fast-paced game where animations blur together, a few frames of stillness gives the eye time to register that contact occurred. Without it, hits can feel like they pass through enemies.

2. **Weight**: By momentarily resisting the attacker's motion, hitstop creates the illusion of mass and physical resistance — the same reason a boxer's fist visually decelerates on contact. A sword that passes through an enemy unimpeded feels like it's cutting air. One that *stops* feels like it struck flesh.

3. **Punctuation**: Hitstop creates rhythm in combat. It separates individual hits into discrete, readable events. Fast combo strings become a staccato rhythm rather than visual mush. This is especially important at high action density.

### The Sakurai Perspective

Masahiro Sakurai (creator of Smash Bros) wrote extensively about hitstop in his Famitsu column "Thinking About Hitstop" (Vol. 490-491). Key design philosophies:

- Hitstop is **the single most important** technique for making attacks feel impactful in fighting games
- It features most prominently in 2D fighters and is less compatible with 3D fighters (Tekken and Virtua Fighter use very little)
- **Projectiles should have less hitstop** than melee attacks — the attacker is far away and shouldn't feel their character freeze
- **Electric attacks get 1.5x hitstop** to sell a different *type* of impact (crackling, sustained contact vs. a clean strike)
- There must be a **hard cap** on hitstop duration regardless of damage, to prevent the game from feeling broken at extreme damage values
- The design challenge is balancing "enough to feel impactful" against "not so much that it disrupts flow"

### The Feedback Triad

Research on game feel (including academic studies from CHI and FDG conferences) identifies three critical components that must work together:

1. **Hit stop** (temporal feedback) — the freeze
2. **Sound design** (audio feedback) — the impact SFX
3. **Camera response** (spatial feedback) — screen shake, zoom

A lack of dedicated design on **any one** of these three can ruin the overall impact feel, even if the other two are excellent. They are multiplicative, not additive.

---

## 3. Cross-Game Comparison

### Super Smash Bros. (Fighting / Platform Fighter)
- **Duration**: 4-30 frames (67-500 ms) scaling with damage
- **Who freezes**: Both attacker and defender (symmetric)
- **Scaling**: Linear with damage, capped at 30 frames
- **Special**: Electric attacks 1.5x, crouch cancel 0.667x, per-move multipliers

### Street Fighter Series (Traditional Fighting)
- **Duration**: ~9 frames for light attacks, ~11 for medium, ~13 for heavy (at 60 fps)
- **Who freezes**: Both players
- **Scaling**: Fixed per attack strength tier, not per-damage
- **Special**: Focus attacks (SF4) and counter hits increase hitstop; key for creating hit-confirm windows where players can visually react to whether they hit or were blocked

### Guilty Gear / BlazBlue (Anime Fighting)
- **Duration**: Varies widely; BlazBlue's Fatal Counters have notably long hitstop
- **Design intent**: Long hitstop on counter hits makes frame-perfect combo links more executable — it is a *leniency* mechanic disguised as juice
- **Lesson**: Hitstop can serve mechanical purposes (input windows) beyond pure feel

### Captain Commando / Capcom Beat 'Em Ups (Side-Scrolling Brawler)
- **Duration**: Universal 8 frames (~133 ms) across all attacks in Captain Commando (1991)
- **Who freezes**: Attacker and defender only; non-involved entities keep moving
- **Key insight**: In beat-em-ups where you hit groups, hitstop is kept short and uniform to avoid freeze-lock. Freeze is *selective* — only involved parties stop.

### Hollow Knight (2D Metroidvania)
- **Duration**: Very brief per nail hit (~2-4 frames / 33-67 ms estimated)
- **Key technique**: Combines hitstop with **knockback on both characters** — the Knight bounces back from every nail strike, selling impact through displacement rather than long freezes
- **Damage taken**: When the Knight is hit, the game applies a longer freeze + music cuts out + white flash on enemy, forcing the player to register the damage event
- **Design insight**: Asymmetric freeze durations — damage *dealt* gets minimal hitstop, damage *received* gets dramatic hitstop. This keeps offense flowing while making defense feel urgent.

### Celeste (2D Platformer)
- **Duration**: 3 freeze frames at the start of each dash (out of a 15-frame total dash)
- **Purpose**: Not combat hitstop, but the same principle — freeze frames at the start of a dash create a sense of explosive acceleration. The freeze makes the subsequent movement feel faster by contrast.
- **Related techniques**: 4-pixel corner correction, 5-frame input buffering — Celeste's design philosophy is "use frame-level tricks to make things *feel* better than they mechanically are"
- **Lesson for shooters**: Hitstop doesn't have to be about combat. It can punctuate movement abilities, dashes, or teleports.

### Dead Cells (2D Roguelike Action)
- **Duration**: Brief hitstop on melee hits (~2-4 frames estimated), minimal on ranged
- **Key feature**: Very fast combat with many enemies; hitstop is kept extremely short to maintain flow
- **Developer philosophy**: Hidden leniency mechanics ("just in time jump" — 5-frame jump buffer after leaving a ledge) show Motion Twin's commitment to "feel over rules"
- **Lesson**: In fast-paced games with many simultaneous targets, hitstop must be minimal or it stacks up catastrophically

### ULTRAKILL (FPS)
- **Minor hitstop**: < 0.25 seconds for regular hits
- **Major hitstop**: Parries, style kills, and special events get longer freezes with screen flash
- **Key design**: Music and time both stop during hitstop, creating dramatic punctuation
- **Game speed alteration**: Major Assists (accessibility options) do NOT alter hitstop duration — it is treated as sacred feedback
- **Lesson**: Tiered hitstop works well — most hits get tiny pauses, exceptional events get dramatic ones

### Monster Hunter Wilds (3D Action RPG) — A Cautionary Tale
- **The controversy**: The beta shipped with hitstop removed from most weapon attacks. Player response was immediate and negative: "if you didn't have sound/damage numbers you literally cannot tell if your attacks are hitting the monster."
- **The problem**: Slower weapons (hammers, switch axes) felt "suddenly inconsequential" without hitstop. Fast weapons were less affected.
- **The overcorrection**: When Capcom restored hitstop, some players felt it was applied too broadly — the Insect Glaive's fast multi-hit attacks got hitstop that felt excessive for their speed.
- **Resolution**: Director Yuya Tokuda tuned hitstop per weapon type in the final build.
- **Lesson**: Hitstop importance scales with attack speed. Slow, heavy attacks *need* significant hitstop. Fast, multi-hit attacks need very little or none.

### Vlambeer / Nuclear Throne (Top-Down Shooter) — Most Relevant Comparison
- Jan Willem Nijman's GDC talk **"The Art of Screenshake"** is the canonical reference for juice in top-down shooters
- Key techniques: screen shake, camera kick, muzzle flash, enemy knockback, brief freeze frames on kills
- **Lesson**: In a shooter, hitstop is typically reserved for exceptional events (kills, crits, explosions) rather than every bullet hit. Regular hits use other feedback (flash, sound, knockback).

---

## 4. Lessons for Rainboids

### Recommended Frame Counts at 60 fps

Based on the cross-game analysis, here are recommended starting points for a 2D top-down space shooter:

| Event Type | Frames | Milliseconds | Rationale |
|-----------|--------|-------------|-----------|
| Regular bullet hit | **0** | 0 ms | Rapid-fire weapons should NOT hitstop. Use flash + sound + knockback instead. |
| Critical hit | **2-3** | 33-50 ms | Brief punctuation. Enough to notice, not enough to disrupt flow. |
| Enemy kill | **3-5** | 50-83 ms | Slightly longer to sell the moment. Combine with particle burst. |
| Elite/boss kill | **5-8** | 83-133 ms | Dramatic beat. The player earned this. |
| Player takes damage | **4-6** | 67-100 ms | Must be noticeable — damage is information. Combine with screen shake + flash. |
| Player death | **8-12** | 133-200 ms | Maximum dramatic pause before death sequence. |
| Explosive weapon hit | **3-4** | 50-67 ms | Slightly more than regular to sell AOE weight. |
| Power weapon impact | **4-6** | 67-100 ms | Charge shots, missiles — reward the investment. |

### Rapid-Fire Weapons: The Critical Problem

This is the single biggest challenge for hitstop in a shooter. If every bullet of a rapid-fire weapon triggers hitstop:

- At 10 shots/second with 3-frame hitstop each, the game spends **30 of every 60 frames frozen** — half the time is hitstop
- This creates a stutter effect that feels like lag, not impact
- The player loses the sense of continuous fire that makes rapid weapons satisfying

**Solutions:**

1. **No hitstop on regular hits.** Use visual feedback only: enemy flash white for 1-2 frames, hit spark particle, knockback impulse, hit sound. This is how Nuclear Throne, Enter the Gungeon, and most top-down shooters handle it.

2. **Hitstop only on the kill shot.** The final bullet that kills an enemy gets 3-5 frames of hitstop. Every other bullet gets zero. This creates a satisfying punctuation at the end of a damage string.

3. **Cooldown/throttle system.** If you want *some* hitstop on regular hits, implement a minimum interval: "no more than 1 hitstop event per 200ms." This caps freeze at 3 frames per 12-frame window (at 60fps), or ~25% freeze time maximum.

4. **Diminishing hitstop.** First hit on a given enemy gets full hitstop. Subsequent rapid hits get progressively less (e.g., 3, 2, 1, 0, 0, 0...) with a reset timer of ~500ms.

### Single Heavy Hits vs. Rapid Fire

The hitstop budget should be **inversely proportional to fire rate**:

| Weapon Type | Fire Rate | Hitstop Per Hit | Kill Hitstop |
|------------|-----------|----------------|-------------|
| Pulse Cannon (fast) | High | 0 frames | 3-4 frames |
| Storm Needles (burst) | High | 0 frames | 2-3 frames |
| Scatter Gun (spread) | Medium | 0 frames | 3-4 frames |
| Rail Driver (single) | Low | 2-3 frames | 5-7 frames |
| Lance Beam (continuous) | Continuous | 0 frames | 4-5 frames |
| Charge Shot (power) | Very low | 4-5 frames | 6-8 frames |
| Missile Salvo (power) | Low | 3-4 frames per missile | 5-7 frames |
| Nova Blast (power AOE) | Very low | 5-6 frames | 8-10 frames |

### Attacker vs. Defender Freezing

In a top-down shooter, the "attacker" is the player ship and the "defender" is the enemy (or vice versa). Key considerations:

**Freeze the world, not the player (recommended approach):**
- When the player deals damage: Freeze the damaged enemy + brief global time-slow. Player ship keeps moving with full control. This maintains agency.
- When the player takes damage: Freeze the player ship briefly (3-4 frames). This communicates danger and forces a micro-moment of vulnerability.

**Why not freeze the player on their own attacks:**
- In a shooter, continuous movement is survival. Freezing the player ship when they shoot creates a death sentence in bullet-hell scenarios.
- Unlike fighting games (where both players freeze, maintaining fairness), a shooter has asymmetric roles. The player needs to dodge while shooting.

**Alternative: Time-scale approach**
Instead of binary freeze, reduce game speed to 10-20% for 3-5 frames on big hits. Everything slows, including the player, but nothing fully stops. This gives the "weight" feeling without halting player input. Good for crits and kills.

### Interaction with Other Juice

Hitstop should be part of a coordinated feedback stack, but each layer has a role:

| Layer | Purpose | During Hitstop |
|-------|---------|---------------|
| **Hitstop** | Temporal punctuation | — |
| **Screen shake** | Spatial impact | Should trigger AT the hitstop, continue AFTER it resolves |
| **Hit flash** | Visual confirmation | Should appear DURING hitstop (enemy flashes white) |
| **Particles** | Spectacle / reward | Should CONTINUE during hitstop (debris flying while action is frozen sells the impact) |
| **Sound** | Audio confirmation | Should play IMMEDIATELY at impact, not delayed by hitstop |
| **Knockback** | Physical response | Should begin AFTER hitstop resolves |
| **Damage numbers** | Information | Should appear DURING hitstop (readable while action is paused) |

**Critical rule**: Particles and VFX should NOT freeze during hitstop. Only gameplay entities (ships, bullets, enemies) freeze. This creates the dramatic contrast of "the world pauses but the explosion keeps expanding."

### Cooldown/Throttling Strategies

To prevent freeze-lock during intense combat (multiple enemies dying simultaneously, AOE weapons, etc.):

1. **Global hitstop budget**: Maximum N frames of hitstop per second (e.g., 10 frames/sec = 167ms of freeze per second maximum). If the budget is exhausted, subsequent hits only get flash + sound.

2. **Hitstop queue with coalescing**: If multiple hitstop events occur within the same frame (AOE hitting 5 enemies), coalesce them into a single hitstop. Duration = max(individual durations), not sum. Five enemies dying to one Nova Blast = one 8-frame hitstop, not five 5-frame hitstops (25 frames).

3. **Priority system**: Rank events by importance. If budget is tight, only the highest-priority event gets hitstop:
   - Priority 1: Player death
   - Priority 2: Player damage
   - Priority 3: Boss/elite kill
   - Priority 4: Regular enemy kill
   - Priority 5: Critical hit
   - Priority 6: Regular hit (usually zero anyway)

4. **Decay timer**: After a hitstop resolves, no new hitstop can trigger for N frames (e.g., 6 frames = 100ms). This creates a natural rhythm and prevents stutter.

5. **Diminishing returns per target**: Repeated hits on the same enemy reduce hitstop. First crit = 3 frames, second within 500ms = 2 frames, third = 1 frame, subsequent = 0.

---

## 5. Anti-Patterns

### 1. Freezing Everything Uniformly
**The mistake**: Applying the same hitstop to every hit regardless of weapon type, damage, or context.
**Why it hurts**: Light rapid-fire weapons feel sluggish. Heavy weapons don't feel heavier than light ones. The game becomes a stuttering mess during intense combat.
**The fix**: Scale hitstop with attack significance. Many hits should have zero hitstop.

### 2. Freezing Too Long
**The mistake**: Hitstop durations above 150ms for regular events.
**Why it hurts**: Players perceive it as lag or a bug rather than intentional feedback. The threshold where "impactful" becomes "broken" is surprisingly low — around 100ms for regular combat events.
**The fix**: Reserve 100ms+ hitstop for truly exceptional events (boss kills, player death). Keep regular events under 80ms (5 frames at 60fps).

### 3. Additive Multi-Hit Hitstop
**The mistake**: Each enemy hit by an AOE adds its own hitstop duration, so hitting 10 enemies = 10x the freeze.
**Why it hurts**: This was the Monster Hunter problem. The more successful your attack (hitting many enemies), the more the game punishes you with freeze time. Perversely, the best attacks feel the worst.
**The fix**: Coalesce simultaneous hits. Use max(), not sum(). One AOE hitting 10 enemies should feel like one big impact, not ten small ones.

### 4. Freezing the Player During Their Own Rapid-Fire Attacks
**The mistake**: In a shooter, freezing the player ship every time their bullets connect.
**Why it hurts**: Movement is survival. Freezing the player while enemies continue to fire (or while enemy bullets continue to travel) creates unfair deaths. Players will blame the controls, not realize it is hitstop.
**The fix**: In a shooter, the player should rarely or never freeze from their own attacks. Freeze enemies, not the player. (Exception: player taking damage should freeze the player.)

### 5. Hitstop Without Supporting Feedback
**The mistake**: Adding hitstop but not adding corresponding screen shake, hit flash, sound, and particles.
**Why it hurts**: Isolated hitstop feels like a framerate hitch. The brain only interprets the freeze as "impact" when it is accompanied by corroborating evidence (sound, visual flash, camera response). Without the supporting feedback, hitstop actively makes the game feel *worse* than no hitstop at all.
**The fix**: Hitstop is the capstone of a feedback stack, not a standalone technique. Always implement it alongside hit flash, sound, and at least one of (screen shake / knockback / particles).

### 6. Not Having a Global Cap
**The mistake**: Allowing hitstop to scale indefinitely with damage or hit count.
**Why it hurts**: Edge cases *will* create absurd freeze durations. A high-damage crit on a weak enemy, an AOE on a dense pack, a damage buff stacking — without a cap, these create multi-second freezes that feel like crashes. Even Smash Bros has a 30-frame (500ms) cap.
**The fix**: Hard cap on hitstop duration (recommendation for Rainboids: 10 frames / 167ms absolute maximum). Plus a per-second budget cap as described above.

### 7. Uniform Treatment of Offensive and Defensive Hitstop
**The mistake**: Using the same hitstop settings when the player deals damage and when the player receives damage.
**Why it hurts**: These are different communication needs. Dealing damage = reward/confirmation. Taking damage = warning/urgency. They need different durations, different screen effects, different sounds.
**The fix**: Tune offensive and defensive hitstop separately. Defensive hitstop should generally be slightly longer and paired with stronger warning signals (red flash, different shake pattern).

---

## 6. Sources

### Primary Technical References
- [SmashWiki — Hitlag](https://www.ssbwiki.com/Hitlag) — Complete formulas for all Smash games
- [SmashWiki — Hitstun](https://www.ssbwiki.com/Hitstun) — Hitstun vs hitlag distinction
- [Kurogane Hammer — Smash 4 Formulas](https://kuroganehammer.com/Smash4/Formulas)
- [Ultimate Frame Data](https://ultimateframedata.com/)
- [Smash Ultimate Calculator](https://rubendal.github.io/SSBU-Calculator/)

### Design Philosophy and Analysis
- [Source Gaming — "Thinking About Hitstop" (Sakurai's Famitsu Column Vol. 490-1)](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/)
- [CritPoints — "Hitstop/Hitfreeze/Hitlag/Hitpause/Hitshit"](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/)
- [Infil.net — Fighting Game Glossary: Hitstop](https://glossary.infil.net/?t=Hitstop)
- [Shane Sicienski — "Hitstop in Capcom Beat 'Em Ups"](https://shane-sicienski.com/blog/blog-post-title-one-55pmn)
- [TV Tropes — Hit Stop](https://tvtropes.org/pmwiki/pmwiki.php/Main/HitStop)

### Game Feel and Juice
- [Gamasutra — "Improving the Combat Impact of Action Games"](https://www.gamedeveloper.com/audio/improving-the-combat-impact-of-action-games)
- [Wayline — "The Juice Problem: How Exaggerated Feedback is Harming Game Design"](https://www.wayline.io/blog/the-juice-problem-how-exaggerated-feedback-is-harming-game-design)
- [Gamasutra — "Squeezing More Juice Out of Your Game Design"](https://www.gamedeveloper.com/design/squeezing-more-juice-out-of-your-game-design-)
- [Gamasutra — "6 Mistakes That'll Drain the Juice Out of Your Game"](https://www.gamedeveloper.com/design/6-mistakes-that-ll-drain-the-juice-out-of-your-game)
- [Blood Moon Interactive — "Juice in Game Design"](https://www.bloodmooninteractive.com/articles/juice.html)

### Game-Specific Analysis
- [Atomic Bob-Omb — "Hollow Knight & Knockback"](https://atomicbobomb.home.blog/2019/02/05/hollow-knight-knockback/)
- [Medium — "The Hypnotizing Simplicity of Hollow Knight's Combat"](https://medium.com/@roryhoeschen/the-hypnotizing-simplicity-of-hollow-knights-combat-a60f820fd433)
- [ULTRAKILL Wiki — Hitstop](https://ultrakill.fandom.com/wiki/Hitstop)
- [PC Gamer — "Monster Hunter Wilds needs its hitstop back"](https://www.pcgamer.com/games/rpg/capcom-if-youre-listening-monster-hunter-wilds-needs-its-hitstop-back/)
- [GamesRadar — "Monster Hunter Wilds hitstop feels way better in the non-beta build"](https://www.gamesradar.com/games/monster-hunter/monster-hunter-wilds-hitstop-feels-way-better-in-the-non-beta-build-and-the-games-director-was-happy-to-juice-it-back-up-after-overseas-players-apparently-hated-it-in-world/)
- [Smashboards — Hitstop Discussion](https://smashboards.com/threads/source-gaming-thinking-about-hitstop.423200/)

### Talks and Presentations
- [Vlambeer / Jan Willem Nijman — "The Art of Screenshake" (GDC / YouTube)](https://nuclear-throne.fandom.com/wiki/File:Jan_Willem_Nijman_-_Vlambeer_-_%22The_art_of_screenshake%22)
- [The Engineering of Conscious Experience — Vlambeer Analysis](https://theengineeringofconsciousexperience.com/jan-willem-nijman-vlambeer-the-art-of-screenshake/)

### Academic Research
- [ACM FDG 2025 — "Beyond Satisfaction: Game Feel Design for Emotionally Impactful Experiences"](https://dl.acm.org/doi/10.1145/3723498.3723808)
- [ACM CHI PLAY 2024 — "Understanding the Design of Emotionally Impactful Game Feel"](https://dl.acm.org/doi/10.1145/3665463.3678781)
- [arXiv — "Designing Game Feel: A Survey" (Pichlmair & Johansen)](https://arxiv.org/pdf/2011.09201)
