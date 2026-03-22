# Gameplay Enhancement Plan

> Comprehensive research, analysis, and proposals for deepening the Rainboids combat experience across enemies, obstacles, player upgrades, and environmental interactions — designed as a cohesive system where improvements reinforce each other.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Design Philosophy](#2-design-philosophy)
3. [Trickshot & Environmental Combat System](#3-trickshot--environmental-combat-system)
4. [Enemy Behavior Improvements](#4-enemy-behavior-improvements)
5. [New Obstacles & Hazards](#5-new-obstacles--hazards)
6. [Upgrade & Weapon Synergies](#6-upgrade--weapon-synergies)
7. [Wave Pacing & Difficulty Curve](#7-wave-pacing--difficulty-curve)
8. [Implementation Priority & Dependencies](#8-implementation-priority--dependencies)

---

## 1. Current State Analysis

### What Works Well

- **Drifter encounters** are the most engaging — the orbital dance movement combined with arc lightning creates a compelling dodge-and-weave rhythm. The lightning hazards (brief but dangerous) demand spatial awareness.
- **Tangerine (Bomber) mine fields** are the only persistent area-denial mechanic and create excellent positional pressure. Mine lifetime (18s) forces ongoing navigation decisions.
- **Asteroid physics** feel good — knockback, momentum transfer, and bullet-asteroid interactions create emergent chaos. Asteroids as obstacles that you slam into (or get slammed by) is satisfying.
- **Wave structure** (5-act arc from solo introductions to full-spectrum chaos) provides good long-term progression.
- **Weapon variety** is strong — 5 primaries, 5 power weapons, 6 defense skills give meaningful loadout decisions.

### What Falls Flat

**Early wave engagement dips (waves 4-7, 12):**
- **Guardians (waves 4-5):** Axis-aligned square movement is predictable. Spread shot fires infrequently (cooldown 3-8s). They're just slow-moving bullet sponges with no interesting behavioral pressure.
- **Wasps (waves 6-7):** Zigzag movement is visually busy but tactically shallow — they don't react to player position meaningfully. Machine-gun fire is constant but easily dodged at distance.
- **Prowlers (wave 12):** `keep_distance` movement pattern makes them effectively stationary turrets. Slow speed (0.6) means they barely move. Missiles are the only interesting thing, but the enemy itself is a bore.

**Missing mechanical depth:**
- **No environmental combat:** Asteroids don't damage enemies on collision. Explosions are purely visual — no chain reactions, no shrapnel. Player bullets pass through asteroid debris. There is zero environmental combat surface.
- **No ricochet/bounce mechanics:** Bullets terminate on contact with any solid object. No way to bank shots, use geometry, or create indirect attacks.
- **Flat upgrade model:** All upgrades are stat multipliers (more damage, faster fire, more bullets). No mechanical upgrades that change *how* you play — only *how much* damage you deal.
- **Particles are cosmetic:** The extensive particle system (debris, sparks, explosions) has no gameplay interaction. A rich visual system with zero mechanical relevance.

**Collision system gaps:**
- Enemy bullets pass through asteroids (explicitly disabled in collision-system.js:501-503). This removes a major strategic element — asteroids can't be used as cover.
- Enemies push away from asteroids but take no damage from them. No asteroid-as-weapon potential.
- No bullet-to-bullet interactions (shooting down enemy projectiles).

### Core Loop Identified

The emerging gameplay loop is: **navigate obstacles → dodge enemy fire → position for shots → land hits with good timing**. This is fundamentally a bullet-hell movement game where spatial mastery matters more than raw stats. The proposals below are designed to deepen this loop by making the environment an active participant in combat, not just scenery.

---

## 2. Design Philosophy

### Guiding Principles

1. **Environment as Weapon, Not Just Obstacle.** Every physical object in the game world should be a potential combat surface. Asteroids aren't just things to dodge — they're things to shoot *through*, slam enemies *into*, and detonate *near*. This single shift creates enormous emergent depth.

2. **Mechanical Upgrades > Stat Upgrades.** New upgrades should change *how* you fight, not just scale numbers. A ricochet upgrade doesn't do more damage — it lets bullets bounce. A shrapnel upgrade doesn't increase bullet count — it turns destroyed objects into weapons.

3. **Interesting With Few, Fair With Many.** Enemy behaviors must be engaging in 1v1 (early waves) but not overwhelming at scale (late waves). The solution: behaviors that scale in *complexity* early and *quantity* late. An enemy with 3 behavior phases is interesting solo; 6 of them become a pattern to read, not a wall of unfairness.

4. **Readable Danger.** Every hazard must telegraph before dealing damage. Players die to things they could have avoided if they'd been paying attention — never to things they couldn't possibly see coming. This follows bullet-hell orthodoxy: the skill is in reading patterns and finding safe paths through dense fire.

5. **Emergent Combos Over Designed Combos.** Rather than hard-coding "if A + B then C" interactions, create systems with simple rules that combine naturally. Ricochet + explosive = clearing a room by banking an explosive round off an asteroid. The player discovers this, not the designer.

### Reference Games & Patterns

- **Tormentor X Punisher**: Bosses reshape arenas with environmental hazards (acid pools, rotating saws), making difficulty increase through spatial complexity rather than raw numbers.
- **Nuclear Throne**: Environmental destruction creates emergent cover, debris becomes obstacles, chain explosions create chaos. The environment is always in flux.
- **Hades**: Dash-based movement with environmental columns/traps that affect both player and enemies equally. Fair by design.
- **Bullet hell orthodoxy** (Touhou, DoDonPachi): Tiny hitbox, dense readable patterns, pattern recognition as core skill. The fun is in the *weaving*, not the shooting.

---

## 3. Trickshot & Environmental Combat System

This is the highest-impact change. It transforms every existing object into a combat surface.

### 3.1 Bullet Ricochet

**Core mechanic:** Player bullets can bounce off asteroids (and other solid surfaces) instead of being absorbed.

**Design:**
- Bullets that hit an asteroid at a shallow angle (< 45° from surface tangent) **ricochet** off instead of being absorbed
- Steep-angle hits still damage/push the asteroid as they do now
- Ricocheted bullets retain 70% damage, change color slightly (add white tint) to indicate they're bounced
- Bullets can ricochet up to 2 times (prevents infinite bounce chaos)
- Ricochet angle follows reflection physics: angle of incidence = angle of reflection, computed from the asteroid's surface normal at the impact point

**Why this works:**
- Creates a skill ceiling for advanced players — banking shots around corners, hitting enemies behind asteroids
- Makes asteroid fields *more interesting*, not less — dense asteroid waves become puzzle arenas, not just obstacle courses
- Pairs naturally with existing weapons: Scatter Gun + ricochet = room-clearing chaos; Rail Driver + ricochet = precision bank shots
- Feels emergent — players discover ricochet naturally when bullets glance off rocks

**Upgrade path:**
- **Ricochet** (global upgrade, MINOR tier): Enables bullet ricochet. +1 max bounces.
- **Geometry Master** (Ricochet tier 2): Increases ricochet angle threshold to 60°, ricocheted bullets gain slight homing toward nearest enemy.

**Implementation notes:**
- Compute surface normal at asteroid contact point (vector from asteroid center to impact point, normalized)
- Reflect bullet velocity: `v' = v - 2(v·n)n`
- Check incidence angle: `acos(|v·n| / |v|)` — ricochet if > 45° from normal (i.e. glancing)
- Reduce bullet damage by 0.7, increment bounce counter, cap at max bounces
- Visual: add brief spark particle at bounce point, tint bullet slightly white

### 3.2 Asteroid-as-Weapon: Collision Damage to Enemies

**Core mechanic:** Asteroids deal damage to enemies on collision, proportional to relative velocity.

**Design:**
- Damage formula: `baseDamage * (relativeSpeed / referenceSpeed)` where referenceSpeed normalizes for typical collision velocities
- Low-speed bumps deal trivial damage (0.5-1); high-speed asteroid launches deal substantial damage (3-8)
- This means *shooting asteroids toward enemies* becomes a viable tactic — bullet knockback already exists, now it has offensive purpose
- Enemy-asteroid collisions already push enemies away (collision-system.js:972) — adding damage is a small delta

**Why this works:**
- Transforms asteroids from pure obstacles to dual-purpose objects (obstacle + weapon)
- Player bullet-asteroid knockback (already exists, line 102-103) becomes a *tool* — launch asteroids at enemies
- Creates "billiards" moments: bank an asteroid off another asteroid into an enemy cluster
- Scales naturally with asteroid count — dense asteroid waves become target-rich environments

**Upgrade path:**
- No upgrade needed — this is a base mechanic. The environmental physics should just *work*.
- Optional **Demolition** upgrade: Asteroids you shoot deal 2x collision damage to enemies, and shatter into shrapnel on high-speed impacts (see 3.3).

### 3.3 Shrapnel System

**Core mechanic:** When asteroids or enemies are destroyed, debris fragments can deal minor damage to nearby entities.

**Design:**
- On asteroid destruction: 3-5 shrapnel fragments fly outward along the asteroid's velocity + explosion vectors
- Shrapnel fragments are small, fast projectiles that deal 0.3-0.5 damage each
- Shrapnel lifetime: ~0.4s (short — they're debris, not bullets)
- Shrapnel hits everything: enemies, player (at reduced damage), other asteroids
- On enemy destruction: 2-3 shrapnel fragments (smaller, less damage) — this creates chain reaction potential in dense enemy groups

**Why this works:**
- Explosions gain mechanical weight — destroying something near other things is rewarded
- Creates chain reaction potential: shrapnel from one asteroid hits another, which explodes, sending more shrapnel...
- Rewards *positioning* — destroying enemies near other enemies is tactically better than picking them off alone
- The existing particle system already creates visual debris; shrapnel just makes some of those particles deal damage

**Upgrade path:**
- **Shrapnel** (global upgrade, MINOR tier): Enables shrapnel on asteroid destruction. Base 3 fragments.
- **Chain Reaction** (Shrapnel tier 2): Shrapnel can trigger further explosions. +2 fragment count. Enemy explosions also produce shrapnel.

**Implementation notes:**
- Shrapnel entities can reuse the bullet pool with a `shrapnel` type flag
- Short lifetime prevents performance issues (0.4s = ~24 frames max)
- Damage is low enough that it's a bonus, not a primary damage source
- Player shrapnel damage should be ~50% of enemy shrapnel damage (fair but punishing for reckless close-range destruction)

### 3.4 Destructible Enemy Bullets

**Core mechanic:** Player bullets can destroy (some) enemy projectiles by shooting them.

**Design:**
- Only applies to *physical* enemy projectiles: missiles (Prowler), mines (Tangerine), large bullets (Guardian spread)
- Does NOT apply to: lasers (Stalker), lightning (Drifter), sweep beams (Titan) — these are energy, not physical
- Destroying a missile/mine creates a small explosion (cosmetic + minor area damage)
- Destroyed Guardian bullets scatter into 2 smaller bullets that fly in random directions (deflected, not eliminated)

**Why this works:**
- Gives the player something to do in "incoming fire" situations beyond dodging
- Creates meaningful weapon choices: Storm Needles are great for shooting down missile swarms; Rail Driver is wasted on it
- Guardian spread shots become more interesting — you can shoot them, but they scatter, so there's risk/reward
- Tangerine mines already can be shot (15s lifetime, can be destroyed) — this extends the mechanic to other projectile types

**Upgrade path:**
- **Bullet Intercept** (global upgrade): Player bullets can destroy enemy physical projectiles. Destroying a projectile refunds 50% of bullet cooldown.

---

## 4. Enemy Behavior Improvements

### 4.1 Guardian Rework — "The Fortress"

**Problem:** Guardians (waves 4-5) are slow, axis-aligned, and fire infrequently. They're boring bullet sponges.

**Proposed changes:**

**Movement — Shield Wall Formation:**
- When 2+ Guardians are alive, they attempt to maintain formation (line or arc) between themselves
- Formation axis rotates slowly (0.5 rad/s) to face the player
- Individual Guardians strafe laterally along their formation line
- When alone, a Guardian becomes aggressive — switches to direct pursuit at 1.5x speed
- Result: Multiple Guardians create a moving wall; solo Guardian becomes a desperate charger

**Firing — Reactive Spread:**
- Base cooldown reduced from 3-8s to 2-5s (more frequent fire)
- Spread pattern adapts to player distance:
  - Close range (< 200px): tight 3-shot burst, faster projectiles
  - Medium range (200-400px): standard 5-shot spread
  - Long range (> 400px): wide 7-shot arc, slower projectiles (area denial)
- When hit, Guardian retaliates with an immediate snap-shot toward the player (0.5s delay)

**Why this works:**
- Formation behavior makes 2-3 Guardians tactically interesting — you must flank the wall or break formation
- Solo Guardian phase change prevents the "last enemy standing" tedium
- Reactive firing means distance management matters — close is dangerous, far is annoying, medium is the sweet spot
- Retaliation shot punishes mindless sustained fire — you need to dodge after hitting them

### 4.2 Wasp Rework — "The Harassment Specialist"

**Problem:** Wasps (waves 6-7) zigzag randomly and spam machinegun fire. Busy but not threatening.

**Proposed changes:**

**Movement — Strafe Runs:**
- Replace zigzag with deliberate strafe runs: Wasp picks a perpendicular line relative to player, dashes across it at high speed, then pulls away
- Between runs, Wasp circles at medium distance (250px), sizing up the player
- Strafe runs are telegraphed by a brief speed reduction (0.3s) before the dash — player can read the incoming attack
- Wasps coordinate: if 2+ exist, they alternate strafe timing (one attacks while the other circles)

**Firing — Drive-By Bursts:**
- Fire only during strafe runs — concentrated burst of 4-6 shots as they dash past
- Between runs, Wasps do NOT fire (circling phase is safe, strafe phase is dangerous)
- This creates clear threat windows that players can learn to read
- Burst direction leads the player slightly (predictive aim), making strafing necessary

**Why this works:**
- Clear attack pattern with readable tells: circle → slow → DASH+FIRE → circle
- Concentrated danger windows instead of constant low-grade annoyance
- Coordination between multiple Wasps creates interesting overlapping threat windows
- Strafe runs mean Wasps actually fly *past* the player — creating close-range encounters that feel visceral

### 4.3 Prowler Enhancement — "The Sniper"

**Problem:** Prowlers (wave 12) sit at distance and barely move (speed 0.6). They're stationary turrets.

**Proposed changes:**

**Movement — Relocate After Firing:**
- After launching a missile, Prowler immediately relocates to a new vantage point (opposite side of player, behind an asteroid, etc.)
- Relocation speed: 3x normal speed for 1.5s (burst dash to new position)
- Between missiles, Prowler slowly drifts to maintain preferred distance (existing behavior, but now punctuated by repositioning)
- If player closes to < 200px, Prowler drops a proximity mine (shared mechanic with Tangerine, but single mine, short fuse) and dashes away

**Firing — Guided Missiles:**
- Missiles gain slight course correction (gentle homing, not aggressive tracking)
- If missile misses, it loops back for one more pass before expiring
- Missile telegraph: red targeting laser appears on player 1s before launch (gives player time to start moving)
- When at low health (< 30%), fires a salvo of 3 unguided missiles in a spread pattern (desperation move)

**Why this works:**
- "Shoot and relocate" pattern makes Prowlers feel like actual snipers, not turrets
- Missile telegraph creates tension — you see the laser, you know it's coming, you start planning
- Close-range mine drop punishes rushing them, rewarding patient long-range combat
- Low-health desperation salvo creates a dramatic kill moment

### 4.4 Early Wave Intensity — Universal Improvements

**Problem:** With only 1-2 enemies, early waves can feel empty and slow regardless of enemy type.

**Proposed changes:**

**Aggression Scaling by Enemy Count:**
- When only 1 enemy remains in a wave, it enters "cornered" mode:
  - +50% fire rate
  - +30% movement speed
  - Reduced cooldowns on special abilities
  - Visual tell: enemy glows brighter, particles intensify
- When 2 enemies remain, they gain a "coordination" bonus:
  - Attempt to flank player (position on opposite sides)
  - Alternate attack timing (one fires while the other repositions)

**Environmental Pressure:**
- Early waves (1-10) use smaller effective arenas — asteroids form a loose ring, concentrating action
- As wave number increases, arena opens up — more space but more enemies
- This prevents the "chasing a single enemy across an empty map" problem

**Introduction Choreography:**
- New enemy types appear with a brief "showcase" entrance:
  - Enemy spawns with shield (invulnerable for 1.5s)
  - Performs a signature move during shield phase (Wasp does a strafe dash, Guardian deploys spread)
  - Player gets to see the enemy's behavior before the fight begins
  - Follows bullet-hell design principle: "never have an enemy appear and immediately fire at full speed"

---

## 5. New Obstacles & Hazards

### 5.1 Gravity Well

**Concept:** A slowly-moving spatial anomaly that pulls nearby entities toward its center.

**Design:**
- Appears as a dark, swirling vortex with particle effects spiraling inward
- Pull radius: 300px; pull strength scales with proximity (weak at edge, strong at center)
- Affects everything: player, enemies, bullets, asteroids, debris
- Does NOT deal direct damage — the danger is pulling you into enemies, asteroids, or out of position
- Lasts 15-20s, then dissipates
- Spawns in waves 8+ (one per wave, max 2 concurrent)

**Combat surface:**
- Player can use gravity wells tactically: lure enemies near one, then the well does the work of pulling them into asteroid fields
- Bullets fired through a gravity well curve — skilled players can arc shots around obstacles
- Gravity well + asteroid = asteroid accelerated toward enemies by gravitational pull
- Ricochet bullets curving through a gravity well = nutty trick shots

**Visual design:**
- Dark purple/black center with blue-white particle spirals
- Subtle screen-space distortion (chromatic aberration ring) near the well
- Pulsing intensity matches pull strength

### 5.2 Solar Flare Lanes

**Concept:** Periodic energy bursts that sweep across lanes of the play area.

**Design:**
- Telegraph: a faint glowing line appears 2s before the flare fires
- Flare: a wide (40px) beam sweeps across the indicated lane for 0.8s
- Deals moderate damage to anything caught in it (player, enemies, asteroids)
- Flare direction: horizontal, vertical, or diagonal; rotates 15° per occurrence
- Frequency: every 12-18s in waves 15+
- Asteroids caught in a flare are partially destroyed (split into smaller fragments)

**Combat surface:**
- Players can bait enemies into flare lanes — if you know the flare is about to fire, position so enemies are in the lane
- Flares destroy enemy bullets in their path — they can function as a brief "safe corridor"
- Combined with gravity wells: well pulls enemies into an imminent flare lane

### 5.3 Debris Fields (Persistent Asteroid Fragments)

**Concept:** When large asteroids are destroyed, they leave behind a lingering debris cloud that acts as soft terrain.

**Design:**
- Debris field: cluster of 8-12 tiny fragments that slowly drift apart over 10s
- Fragments are too small to collide with (no collision box), but they block line-of-sight for enemy aim
- Enemies cannot fire through debris fields (their targeting AI avoids shooting when debris is between them and player)
- Player bullets pass through debris (player advantage)
- The field glows faintly with the asteroid's residual color

**Combat surface:**
- Destroying a large asteroid near enemies creates temporary cover
- Enemies must reposition to get a clear shot — this forces movement, breaking static patterns
- Debris fields fade after 10s, so they're temporary tactical advantages
- Creates a rhythm: destroy asteroid → use cover → cover fades → destroy another asteroid

### 5.4 Magnetic Mines (New Enemy Drop)

**Concept:** A passive hazard dropped by Sentinels that creates a localized magnetic field.

**Design:**
- Sentinels drop a magnetic mine every 20s (replaces a normal firing cycle)
- Mine sits dormant for 2s (telegraph: pulsing green glow), then activates
- Active mine: pulls nearby player bullets toward itself (radius: 150px), deflecting their trajectories
- Player bullets that hit the mine destroy it (2 hits to destroy)
- Does NOT affect enemy bullets — purely defensive for the enemy team
- Lifetime: 12s; max 3 active per Sentinel

**Combat surface:**
- Forces player to actively clear mines or deal with inaccurate shooting near them
- Creates "dead zones" where player fire is unreliable — must reposition or clear the mine
- Can be used against enemies: shoot a mine near enemies, bullets deflect into them (ricochet adjacent)
- Interaction with gravity well: mine in a gravity well = chaos, all bullets in the area get pulled AND deflected

---

## 6. Upgrade & Weapon Synergies

### 6.1 New Global Upgrades

| Upgrade | Type | Effect | Synergies |
|---------|------|--------|-----------|
| **Ricochet** | Mechanical | Bullets bounce off asteroids (shallow angle). Max 2 bounces. | All primaries; Scatter Gun becomes room-clearing. Rail Driver becomes trick-shot weapon. |
| **Shrapnel** | Mechanical | Asteroid/enemy destruction spawns 3-5 damaging fragments. | Explosive upgrade = bigger shrapnel radius. Ricochet = shrapnel bounces. |
| **Bullet Intercept** | Mechanical | Player bullets destroy enemy physical projectiles. 50% cooldown refund. | Storm Needles becomes anti-missile screen. Multi-shot sweeps more projectiles. |
| **Graviton Rounds** | Mechanical | Bullets exert a small pull on nearby enemies (radius: 50px). Stacks with bullet count. | Multi-shot = stronger pull. Homing + graviton = enemy can't escape. |
| **Impact Detonation** | Mechanical | Bullets that hit asteroids trigger a small AoE blast (radius: 40px). Damage: 30% of bullet damage. | Shrapnel + detonation = massive area effect. Ricochet + detonation = bouncing explosions. |

### 6.2 Weapon-Specific Synergies

**Pulse Cannon + Ricochet:** Reliable bank shots. The single-bullet precision makes ricochet angles predictable.

**Storm Needles + Bullet Intercept:** Creates a defensive screen — the rapid fire rate means you're constantly shooting down incoming missiles and large projectiles. Turns Storm Needles into both offense and defense.

**Scatter Gun + Shrapnel:** Close-range asteroid destruction creates a shrapnel shotgun blast. Destroying asteroids near enemies becomes a deliberate tactic.

**Rail Driver + Ricochet:** Precision bank shots with high damage. Rail Driver's single powerful bullet + ricochet = sniper trick shots through asteroid fields. High skill ceiling, high reward.

**Lance Beam + Gravity Well:** Beam sweeps enemies that are being pulled by a gravity well. The well concentrates enemies into the beam's path.

### 6.3 Defense Skill Interactions

**Phase Dash through Debris Fields:** Dashing through a debris field scatters fragments outward, dealing minor damage to nearby enemies (weaponized cover).

**EMP Pulse + Magnetic Mines:** EMP destroys all magnetic mines in radius and converts them to friendly mines (pull enemy bullets for 5s).

**Deflector Orbs + Shrapnel:** Orbs deflect shrapnel fragments, protecting the player from their own chain reactions. Safety net for aggressive close-range play.

---

## 7. Wave Pacing & Difficulty Curve

### Current Problems

The difficulty curve has several flat spots where engagement drops:

| Waves | Issue | Root Cause |
|-------|-------|------------|
| 4-5 | Slow, boring | Guardians are passive bullet sponges |
| 6-7 | Busy but not threatening | Wasps are random, fire is easily dodged |
| 12 | Feels static | Prowlers don't move |
| 25 | Anti-climax | "Breather" wave with minimal enemies |

Research on bullet-hell pacing (Boghog's shmup 101, Sparen's Danmaku Design Studio) emphasizes:
- Difficulty should oscillate, not just climb — hard wave → breathing room → harder wave
- Wave overlap creates flow: if a player kills enemies quickly, the next wave arrives cleanly; if slowly, waves overlap and compound difficulty
- Each wave should teach or test something specific

### Proposed Pacing Adjustments

**Waves 1-3 (Tutorial):** Keep as-is. Hunters are a good introduction — simple, readable, and teach basic combat.

**Waves 4-5 (Guardian rework applies):** With formation behavior and reactive firing, Guardians become a positioning puzzle. The wall formation teaches flanking. Reduce to 1 Guardian in wave 4, 2 in wave 5 (quality over quantity).

**Waves 6-7 (Wasp rework applies):** Strafe runs with clear attack windows teach pattern reading. This is the player's first "bullet-hell moment" — dodge the drive-by, counter-attack in the safe window.

**Wave 8 (Stalker + Gravity Well intro):** Introduce the first gravity well alongside Stalkers. Gravity well + laser sniper = "move or die" pressure. Teaches gravity well mechanics in a controlled setting.

**Waves 10-11 (Drifter):** Keep as-is — Drifters are already the best-designed enemy. The orbital dance + lightning is peak Rainboids.

**Wave 12 (Prowler rework applies):** With shoot-and-relocate behavior and missile telegraph, Prowlers become tense sniper duels. Fewer asteroids (3) to give clear sight lines.

**Wave 15 (Tangerine + debris field intro):** Introduce debris fields alongside mine-layer Bombers. Debris blocks mine visibility — you must navigate carefully, using debris as cover while watching for hidden mines.

**Wave 25 (Reworked breather):** Instead of boring "asteroid storm," make it a *puzzle wave*: dense asteroid field, no enemies, but 2 gravity wells pulling asteroids around. Player must navigate the gravitational chaos. Reward: bonus coins for surviving without damage.

### Engagement Oscillation Pattern

```
Tension: ▁▂▃▅▃▆▃▇▅█▆▅▇▆▅ █▇▆▇█▇█▇█▇ █████████████
Wave:    1 2 3 4 5 6 7 8 9 0 1 2 3 4 5  6 7 8 9 0 1 ...
         ├── Act I: Learn ──┤├── Act I: Test ──┤ ├ Act II ─
```

Key: Every 2-3 high-tension waves should be followed by a lower-tension wave that still *feels* active (puzzle wave, asteroid navigation, solo enemy duel — not "empty field with 1 hunter").

---

## 8. Implementation Priority & Dependencies

### Tier 1 — Foundation (Highest Impact, Moderate Effort)

These create the environmental combat system that everything else builds on.

| # | Feature | Effort | Dependencies | Impact |
|---|---------|--------|-------------|--------|
| 1a | Asteroid-enemy collision damage | Small | None | Transforms asteroids from obstacle to weapon |
| 1b | Shrapnel system | Medium | New shrapnel entity type | Chain reactions, positional depth |
| 1c | Bullet ricochet | Medium | Surface normal calculation | Trick shots, skill ceiling |
| 1d | Enemy aggression scaling (cornered/coordination) | Small | None | Fixes early-wave tedium |

### Tier 2 — Enemy Reworks (High Impact, Medium Effort)

Depends on Tier 1 (enemies should interact with the new environmental system).

| # | Feature | Effort | Dependencies |
|---|---------|--------|-------------|
| 2a | Guardian formation + reactive firing | Medium | None |
| 2b | Wasp strafe runs | Medium | None |
| 2c | Prowler shoot-and-relocate | Medium | None |
| 2d | Enemy introduction choreography | Small | None |

### Tier 3 — New Hazards (Medium Impact, Medium Effort)

Expands the obstacle vocabulary.

| # | Feature | Effort | Dependencies |
|---|---------|--------|-------------|
| 3a | Gravity well | Medium-Large | Affects all entity physics |
| 3b | Debris fields (line-of-sight blocking) | Medium | Asteroid destruction system |
| 3c | Solar flare lanes | Medium | None |
| 3d | Sentinel magnetic mines | Small | Bullet deflection math |

### Tier 4 — Upgrades & Synergies (Medium Impact, Small-Medium Effort)

Builds on Tier 1-3 mechanics with upgrade tree additions.

| # | Feature | Effort | Dependencies |
|---|---------|--------|-------------|
| 4a | Ricochet upgrade | Small | Tier 1c |
| 4b | Shrapnel upgrade | Small | Tier 1b |
| 4c | Bullet Intercept upgrade | Small | Destructible bullets system |
| 4d | Graviton Rounds upgrade | Small | None |
| 4e | Impact Detonation upgrade | Small | Tier 1c or standalone |

### Tier 5 — Wave Pacing & Polish

| # | Feature | Effort | Dependencies |
|---|---------|--------|-------------|
| 5a | Wave pacing adjustments | Small | Tiers 2a-2c |
| 5b | Puzzle/breather wave redesign | Small | Tier 3a |
| 5c | Arena size scaling by wave | Small | None |

### Recommended Implementation Order

```
Phase A:  1a → 1d → 2a → 2b → 2c → 2d      (env combat + enemy reworks)
Phase B:  1b → 1c → 4a → 4b                   (ricochet + shrapnel + upgrades)
Phase C:  3a → 3b → 3c → 3d                   (new hazards)
Phase D:  4c → 4d → 4e → 5a → 5b → 5c         (remaining upgrades + pacing)
```

Phase A is self-contained and delivers the biggest gameplay improvement. Phase B adds the trick-shot system. Phases C and D layer on additional depth. Each phase can be shipped independently.

---

## Research Sources

- [Bullet Hell Game Design Overview](https://www.scribd.com/document/102633244/Bullet-Hell-Design-Doc) — pattern design fundamentals
- [Building the Bullet Hell Systems of Luna Abyss](https://www.gamedeveloper.com/design/building-the-bullet-hell-systems-of-luna-abyss) — modern bullet-hell implementation
- [Boghog's Bullet Hell Shmup 101](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101) — wave pacing and overlap dynamics
- [Balancing a Shmup](https://www.gamedeveloper.com/design/balancing-the-sh-out-of-our-shmup) — difficulty curve and heatmap testing
- [The Anatomy of a Shmup](https://www.gamedeveloper.com/design/the-anatomy-of-a-shmup) — enemy introduction and pacing theory
- [Game Enemy Design Starter Guide](https://gamedevfriends.com/enemy-design-starter-guide/) — enemy behavior scaling principles
- [7 Twin-Stick Shooters to Study](https://www.gamedeveloper.com/design/7-twin-stick-shooters-that-game-developers-should-study) — environmental hazard patterns
- [Environmental Hazards in Game Design](https://www.meegle.com/en_us/topics/game-design/environmental-hazards) — hazard taxonomy
- [Sparen's Danmaku Design Studio](https://sparen.github.io/ph3tutorials/ddsga2.html) — difficulty oscillation and pattern readability
- [Giest118's Guide to Bullet Hell Bosses](https://shmups.system11.org/viewtopic.php?t=44816) — boss pacing and telegraph design
- [Difficulty Curve-Based Procedural Generation](https://www.researchgate.net/publication/343188131_Difficulty_Curve-Based_Procedural_Generation_of_Scrolling_Shooter_Enemy_Formations) — wave difficulty modeling
