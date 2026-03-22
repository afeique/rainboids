# Primary Weapon System — Research & Redesign Plan

## The Problem

Primary weapons in Rainboids are **functionally dead weight** for most players. The costs are prohibitively high relative to early-game income, meaning the majority of players will never buy a second primary weapon — and those who do will acquire it so late that the novelty is diminished. The current system creates a Diablo 3 Auction House problem: the best way to progress is to hoard currency, not to experiment.

---

## Current State Analysis

### The Five Primary Weapons

| Weapon | Cost | SP | Unlock | DPS | Fire Rate | Range | Identity |
|--------|------|----|--------|-----|-----------|-------|----------|
| **Pulse Cannon** | FREE | 0 | Wave 0 | 2.5 | 400ms | 1.0x | Accurate, reliable workhorse |
| **Storm Needles** | 1500 | 1 | Wave 2 | ~2.3 | 130ms | 0.7x | Rapid spray, DoT, chain lightning |
| **Scatter Gun** | 2000 | 2 | Wave 3 | ~2.9 | 700ms | 0.5x | Close-range burst, slug every 4th shot |
| **Rail Driver** | 2500 | 2 | Wave 5 | 2.5 | 1200ms | 1.5x | Piercing sniper, knockback, idle boost |
| **Lance Beam** | 3000 | 3 | Wave 7 | Variable | 1200ms cycle | 1.2x | Channeled sweep, splits, area damage |

### Upgrade Trees (Per Weapon)

**Pulse Cannon (3 upgrades):** Steady Aim (-8% spread, 600c), Overcharge (+15% damage, 800c), Echo Round (10% bonus bullet, 1200c)

**Storm Needles (4 upgrades):** Needle Storm (+15% fire rate, 600c), Poison Tip (1 DoT/2s, 1200c), Static Charge (chain every 10th, 1800c), Suppression (-15% enemy fire rate, 1500c)

**Scatter Gun (4 upgrades):** Tight Choke (-15% spread, 700c), Buckshot (+1 pellet, 1000c), Shrapnel (fragment at max range, 1500c), Slug Round (4x damage every 4th, 2000c)

**Rail Driver (4 upgrades):** Penetrator (+50% range, 800c), Kinetic Impact (knockback, 1000c), Railgun Capacitor (2x after 2s idle, 1500c), Through and Through (damage trail, 2500c)

**Lance Beam (4 upgrades):** Beam Width (+30%, 700c), Linger (+0.1s duration, 1000c), Refraction (splits on hit, 1800c), Overload (3x damage final 0.1s, 1500c)

### The Economics Problem

- **Wave 1-2 income:** ~500-1000 coins total (enemies, orbs, wave clear bonus)
- **Cheapest weapon (Storm Needles):** 1500 coins + 1 SP
- **Most players' Wave 3 bank:** ~1500-2500 coins total
- **But they also need:** Global upgrades (Rapid Fire 300c, Long Range 150c, etc.), defense skills, power weapons

The player faces a **false dilemma**: spend 1500c on a new weapon they've never tried (risky), or spend the same amount on guaranteed stat improvements for the Pulse Cannon (safe). Rational players always choose the safe option. By the time they can "afford" to experiment, they're invested in Pulse Cannon upgrades and switching feels like wasted money.

**This is the Diablo 3 Auction House problem**: when the best strategy is to optimize currency rather than experiment, the system has failed.

---

## Industry Research: How Other Games Solve This

### Pattern 1: Free Acquisition, Paid Depth (Strongest Pattern)

| Game | How weapons are acquired | Where money goes |
|------|--------------------------|------------------|
| **Vampire Survivors** | Free on level-up (pick 1 of 3-4) | N/A — no shop economy |
| **Hades** | Cheap unlock (Chthonic Keys), free pre-run selection | Titan Blood → Aspects (deep upgrades) |
| **Mega Man** | Earned by beating bosses | N/A — mastery-gated |
| **Deep Rock Galactic** | Unlocked at level milestones (10/15/20) | Credits → Overclocks (mods) |

**The lesson:** Acquisition should be free or nearly free. The interesting investment is in *customizing* the weapon, not in *getting* it.

### Pattern 2: Buy Cheap, Level Through Use

| Game | Acquisition cost | How power grows |
|------|-----------------|-----------------|
| **Ratchet & Clank** | Affordable shop purchase | XP from use → weapon levels up → transforms |
| **Warframe** | Crafted from blueprints + resources | Mods (account for 99% of power) |
| **Destiny 2** | Activity drops + crafting | Use weapon to attune → extract materials → craft |

**The lesson:** If you charge for weapons, charge little — and make the weapon *grow* through use, creating attachment.

### Pattern 3: Milestone Unlocks

| Game | Unlock trigger | Player feeling |
|------|---------------|----------------|
| **Dead Cells** | Blueprints (enemy drops) + Cells (between-run currency) | Earned through mastery |
| **Enter the Gungeon** | Boss drops (guaranteed if no gun found on floor) | Reward for skill |
| **Nuclear Throne** | Drop pool expands per level | Discovery |

**The lesson:** Tying unlocks to gameplay milestones (not currency) makes them feel *earned* rather than *purchased*.

### The Diablo 3 Cautionary Tale

Early D3's Auction House made the optimal strategy "farm gold, buy gear" instead of "play the game, find gear." Director Jay Wilson admitted it "really hurt the game." The fix (Loot 2.0): removed the AH, made drops smart (85% roll for your class), and added **legendary affixes that transform how skills play** — not just stat increases.

**Direct parallel to Rainboids:** When the cost of weapons is so high that players hoard coins instead of experimenting, you have an AH problem. The fix is the same: make acquisition free/cheap, make depth expensive.

---

## Differentiation Analysis: Are the Weapons Different Enough?

### Current Weapon Identity Map

```
                    LONG RANGE
                        │
                   Rail Driver
                   (sniper, pierce)
                        │
                        │
    BURST ──────── Pulse Cannon ──────── SUSTAINED
    (Scatter Gun)  (balanced center)     (Storm Needles)
                        │                (Lance Beam)
                        │
                   SHORT RANGE
```

**Verdict: The differentiation is already good in theory.** Each weapon occupies a distinct tactical niche:

| Weapon | Playstyle | Risk Profile | Best Against |
|--------|-----------|--------------|--------------|
| Pulse Cannon | Balanced, safe | Low risk, medium reward | Everything (generalist) |
| Storm Needles | Aggressive spray | Medium risk (short range) | Swarms, applies debuffs |
| Scatter Gun | In-your-face brawler | High risk, high reward | Single targets up close |
| Rail Driver | Patient sniper | Low risk if disciplined | Lines of enemies, bosses |
| Lance Beam | Sweeping area control | Medium risk (channel lock) | Groups, area denial |

**The problem isn't differentiation — it's that players never experience the differentiation** because they can't afford to try the weapons.

### Differentiation Gaps to Address

1. **Pulse Cannon is too good as a default.** It has no weakness. A generalist weapon should have a generalist *limitation* — otherwise, why switch?
2. **Storm Needles and Lance Beam both fill "sustained damage" role** — they need sharper identity separation.
3. **No weapon explicitly excels at boss-killing** — Rail Driver comes closest, but its DPS is only 2.5 (same as Pulse Cannon).
4. **Upgrade trees are too small** (3-4 nodes each). Compared to Last Epoch's sprawling skill trees, these feel like minor buffs, not build-defining choices.

---

## Recommended Redesign

### Core Principle: Free Acquisition, Paid Depth

> **Acquisition should be easy; depth should be hard.**
> — Pattern across Hades, Vampire Survivors, Mega Man, Deep Rock Galactic, Ratchet & Clank

### Change 1: Wave-Milestone Unlocks (Replace Shop Purchase)

Remove coin/SP costs from primary weapons entirely. Instead, unlock them automatically at wave milestones with a **selection ceremony** — a brief popup between waves that introduces the weapon and lets the player try it or skip it.

| Weapon | Current | Proposed |
|--------|---------|----------|
| Pulse Cannon | Free, Wave 0 | Free, Wave 0 (unchanged) |
| Storm Needles | 1500c + 1 SP, Wave 2 | **Free unlock at Wave 3 clear** |
| Scatter Gun | 2000c + 2 SP, Wave 3 | **Free unlock at Wave 5 clear** |
| Rail Driver | 2500c + 2 SP, Wave 5 | **Free unlock at Wave 8 clear** |
| Lance Beam | 3000c + 3 SP, Wave 7 | **Free unlock at Wave 12 clear** |

**Unlock ceremony flow:**
1. Player clears the milestone wave
2. Between-wave popup: "NEW WEAPON UNLOCKED" with weapon name, description, and a brief visual demo (animated sprite showing the weapon firing)
3. Two buttons: **"Equip Now"** (switches immediately) or **"Keep Current"** (stays with current weapon; new one added to inventory for later)
4. The popup is brief (5-8 seconds) and skippable — no forced tutorial

**Why these wave numbers:**
- Spacing gives time to learn each weapon before the next arrives
- Wave 3 (Storm Needles) = after the player has internalized Pulse Cannon basics
- Wave 5 (Scatter Gun) = entering mid-game when enemy density increases
- Wave 8 (Rail Driver) = when long-range threats (Prowlers, Titans) appear more
- Wave 12 (Lance Beam) = reward for reaching deep mid-game; complex weapon for experienced players

### Change 2: Redirect Currency to Weapon Upgrades

The coins and SP that were previously spent on acquisition now flow into deeper upgrade trees. This also fixes the "save all money" anti-pattern — there are always affordable, meaningful upgrades to buy.

**Reduce upgrade costs slightly** (weapons are free now, so the total economy shifts):

| Upgrade tier | Current cost range | Proposed cost range |
|--------------|-------------------|---------------------|
| Tier 1 (basic) | 600-800c | 400-600c |
| Tier 2 (mid) | 1000-1500c | 800-1200c |
| Tier 3 (advanced) | 1500-2500c | 1200-2000c |

This makes the first upgrade for any new weapon affordable within 1-2 waves of unlocking it, creating an immediate "first investment" moment that builds attachment.

### Change 3: Expand Upgrade Trees (Build Identity)

Currently weapons have 3-4 upgrades each. Expand to **6-8 upgrades per weapon**, organized into **two divergent paths** that create distinct sub-builds. This follows the Last Epoch skill specialization model — same base weapon, wildly different playstyles depending on which path you invest in.

#### Pulse Cannon — "Reliable" vs "Explosive"

**Path A — Precision (reward accuracy):**
1. Steady Aim — -10% spread per stack (max 3) | 400c
2. Overcharge — +20% damage per stack (max 3) | 600c
3. Echo Round — 15% chance bonus bullet (max 2) | 1000c
4. **Marksman** — Consecutive hits on same target deal +5% damage (stacking, resets on miss) | 1500c

**Path B — Saturation (reward volume):**
1. Rapid Pulse — +10% fire rate per stack (max 3) | 400c
2. Split Shot — 20% chance to fire 2 bullets (max 2) | 800c
3. Volatile Rounds — Bullets explode for 30% AoE on hit | 1200c
4. **Chain Reaction** — Explosions have 10% chance to trigger another explosion | 1800c

#### Storm Needles — "Debuffer" vs "Swarm"

**Path A — Toxin (crowd control):**
1. Poison Tip — 1 DoT for 2s per hit | 500c
2. Suppression — Hit enemies fire 15% slower for 1.5s | 800c
3. Corrosion — Poisoned enemies take 10% more damage from all sources | 1200c
4. **Pandemic** — Poison spreads to nearby enemies on kill | 1800c

**Path B — Overload (raw damage):**
1. Needle Storm — +15% fire rate per stack (max 3) | 400c
2. Static Charge — Every 8th needle chains to nearby enemy | 1000c
3. Electrocute — Chained enemies are stunned for 0.3s | 1400c
4. **Tesla Coil** — After 20 consecutive hits, emit a lightning nova | 2000c

#### Scatter Gun — "Shotgun" vs "Slug"

**Path A — Spread (close-range devastation):**
1. Buckshot — +1 pellet per stack (max 2) | 500c
2. Tight Choke — -15% spread per stack (max 3) | 700c
3. Shrapnel — Pellets fragment at max range | 1200c
4. **Point Blank** — 2x damage within 50px of target | 1800c

**Path B — Marksman (precision burst):**
1. Slug Round — Every 3rd shot is a single big slug (5x damage) | 800c
2. Slug Velocity — Slugs travel 50% faster and further | 1000c
3. Slug Pierce — Slugs pierce through 2 enemies | 1400c
4. **Slug Detonation** — Slugs explode at end of range for massive AoE | 2000c

#### Rail Driver — "Sniper" vs "Railgun"

**Path A — Precision (single-target obliteration):**
1. Railgun Capacitor — 2x damage after 2s idle | 800c
2. Penetrator — +50% range per stack (max 2) | 600c
3. Armor Break — Hit enemies lose 20% damage resistance for 3s | 1200c
4. **Executioner** — 3x damage to enemies below 30% health | 1800c

**Path B — Devastation (area impact):**
1. Kinetic Impact — Enemies hit are knocked back | 800c
2. Through and Through — Leaves a lingering damage trail | 1200c
3. Shockwave — Pierced enemies emit a small damage pulse | 1500c
4. **Cataclysm** — Every 5th shot fires a double-width rail that deals 150% damage | 2000c

#### Lance Beam — "Sweeper" vs "Focused"

**Path A — Wide Sweep (area denial):**
1. Beam Width — +30% width per stack (max 3) | 500c
2. Linger — +0.15s beam duration per stack (max 3) | 800c
3. Refraction — Beam splits on hitting enemy | 1500c
4. **Prism** — Split beams split again (cascading refraction) | 2000c

**Path B — Concentrated (single-target melt):**
1. Overload — Final 0.2s deals 3x damage | 800c
2. Focus Lens — Beam narrows over time but deals +50% damage at max focus | 1000c
3. Burn — Beam applies 3 DoT for 3s (stacking) | 1400c
4. **Annihilate** — After 0.5s continuous hit on same target, damage doubles | 1800c

### Change 4: Pulse Cannon Needs a Weakness

The Pulse Cannon is currently "good at everything, bad at nothing." For weapon choice to matter, the default must have a clear limitation that other weapons address.

**Proposed adjustment:**
- Reduce Pulse Cannon range to **0.85x** (from 1.0x) — still medium range, but noticeably shorter than Rail Driver and Lance Beam
- Reduce damage to **0.8** (from 1.0) — still functional, but lower DPS ceiling than specialized weapons
- Keep fire rate and accuracy as-is (these are its strengths)

This makes the Pulse Cannon a "safe but limited" option — reliable and forgiving, but other weapons clearly outperform it in their niches. The player feels a gentle push to try alternatives without being punished for sticking with the default.

### Change 5: "Try Before You Buy" — Wave Preview

When a weapon unlocks, the player should get a brief taste of it *in combat*, not just a description. Two approaches:

**Option A — Bonus Wave:** After the milestone wave, spawn a short bonus wave (5-10 enemies, 15 seconds) where the player automatically uses the new weapon. No death penalty. This lets them feel the weapon's rhythm before deciding to equip it.

**Option B — Dual-Wield Preview:** For the first wave after unlock, the player can tap a button to temporarily swap to the new weapon and back (like a test drive). After the wave, they choose which to keep equipped.

Option A is simpler to implement and more dramatic. Option B is less disruptive to flow.

### Change 6: Weapon Mastery XP (Ratchet & Clank Model)

Add a **mastery system**: each weapon earns XP through use (kills, damage dealt, time equipped). Mastery levels unlock cosmetic upgrades (visual transforms, muzzle effects, hit sounds) and provide small stat bonuses (+2% damage per mastery level, capping at level 10 = +20%).

This serves two purposes:
1. **Incentivizes breadth** — players want to try all weapons to see their mastery rewards
2. **Rewards depth** — sticking with a weapon makes it *feel* more powerful through visual upgrades
3. **Creates attachment** — a weapon you've leveled up feels like *your* weapon

Mastery XP should be **front-loaded**: level 1-3 come quickly (a few waves each), levels 8-10 take many waves. This ensures immediate reward for trying a new weapon.

---

## Implementation Plan

### Phase 1 — Free Unlocks (Minimum Viable Change)
1. Remove coin/SP costs from all primary weapons in `weapon-data.js`
2. Change `unlockWave` values to new milestone waves (3, 5, 8, 12)
3. Add unlock ceremony popup (between-wave overlay with weapon preview, "Equip Now" / "Keep Current" buttons)
4. Reduce upgrade costs by ~30% across the board
5. Update shop UI to remove "BUY" buttons for primaries (show "UNLOCKED" or "LOCKED: WAVE X")

**Files:** `weapon-data.js`, `game-engine.js` (shop logic, wave transition), `ui-manager.js` (unlock popup)

### Phase 2 — Expanded Upgrade Trees
1. Add new upgrades to each weapon (6-8 per weapon, organized into two paths)
2. Add visual indicators in shop for upgrade paths (Path A vs Path B with connecting lines)
3. Apply Pulse Cannon stat adjustments (range 0.85x, damage 0.8)
4. Implement new upgrade effects (Pandemic, Tesla Coil, Point Blank, Executioner, Prism, Annihilate, etc.)

**Files:** `weapon-data.js`, `game-engine.js` (upgrade effect application), `entities/player.js` (fire logic for new effects), `entities/bullet.js` (new bullet behaviors)

### Phase 3 — Weapon Mastery
1. Add mastery XP tracking per weapon (`player.weaponMastery = { PULSE_CANNON: { xp: 0, level: 0 }, ... }`)
2. XP earned on kill (proportional to enemy value), on damage dealt, and passively while equipped
3. Mastery levels (1-10) with front-loaded XP curve
4. Visual upgrades per mastery level (muzzle color shift, projectile trail enhancement, hit particle evolution)
5. Small stat bonus per level (+2% damage, capping at +20% at level 10)
6. Mastery level displayed next to weapon name in shop and HUD

**Files:** `entities/player.js` (mastery tracking), `game-engine.js` (XP award on kill), `weapon-data.js` (mastery level definitions), rendering code for visual upgrades

### Phase 4 — Try-Before-You-Buy
1. Implement bonus wave on weapon unlock (5-10 enemies, 15 seconds, forced new weapon)
2. No death penalty during bonus wave
3. Post-wave choice: "Equip [New Weapon]" or "Return to [Current Weapon]"

**Files:** `game-engine.js` (bonus wave spawning, weapon forcing), `wave-data.js` (bonus wave configs), `ui-manager.js` (choice popup)

---

## Economic Rebalance Summary

| Item | Current | Proposed | Reasoning |
|------|---------|----------|-----------|
| Weapon acquisition | 1500-3000c + 1-3 SP | **Free at wave milestones** | Removes hoarding incentive |
| Upgrade tier 1 | 600-800c | 400-600c | Affordable within 1-2 waves of unlock |
| Upgrade tier 2 | 1000-1500c | 800-1200c | Mid-game investment |
| Upgrade tier 3 | 1500-2500c | 1200-2000c | Late-game commitment |
| Upgrades per weapon | 3-4 | **6-8 (two paths)** | Build identity and replayability |
| Pulse Cannon damage | 1.0 | **0.8** | Creates reason to switch |
| Pulse Cannon range | 1.0x | **0.85x** | Creates reason to switch |

**Where does the freed-up currency go?**
- Deeper upgrade trees (more nodes to buy)
- Power weapon upgrades (separate economy)
- Defense skill upgrades
- Global stat upgrades
- The player always has something meaningful to spend on

---

## Expected Outcomes

1. **100% of players will experience at least 3 primary weapons** by wave 12 (vs current ~10% who buy a second weapon)
2. **Build diversity increases** — two players on wave 15 will have meaningfully different loadouts based on which upgrade paths they chose
3. **Currency anxiety eliminated** — no more "should I save for Storm Needles or buy Rapid Fire?" false dilemma
4. **Replayability increases** — 5 weapons × 2 paths each = 10 distinct build directions
5. **Engagement loop tightens** — unlock → try → invest → master → unlock next → repeat

---

## References

- **Vampire Survivors**: Free weapon acquisition via level-up choices; evolution system for depth
- **Hades**: Cheap unlock (Chthonic Keys), deep investment (Aspects via Titan Blood), free in-run customization (Boons)
- **Ratchet & Clank**: Affordable purchase + weapon leveling through use (visual transforms, upgrade trees)
- **Diablo 3**: Auction House failure (prohibitive costs → hoarding → disengagement); Loot 2.0 fix (free smart drops + build-defining legendaries)
- **Last Epoch**: Skill specialization trees (deep per-skill investment with divergent paths)
- **Enter the Gungeon**: Boss-guaranteed drops ensure minimum weapon variety per floor
- **Mega Man**: All weapons earned through mastery; situational use over strict upgrades
- **Deep Rock Galactic**: Level-milestone unlocks; Overclocks for deep customization
- **Path of Exile**: Weapons as skill enablers; support gems create build identity
- **Warframe**: Mastery rank incentivizes trying every weapon; mods provide 99% of power
- **Dead Cells**: Blueprint meta-progression; pool dilution as cautionary tale
- **Slay the Spire**: The value of "skip" as a choice; deck dilution as anti-pattern
- **Risk of Rain 2**: Stacking with hyperbolic scaling; emergent synergies from simple rules

---

## Shop UI — Current State Analysis

The shop is **entirely canvas-rendered** (no DOM elements). It opens as a modal overlay during wave transitions or from the pause menu.

### Layout Structure

```
+--[X]----------------------------------------------+
|                      SHOP                          |
|              💰 1,234    56 SP                     |
| [OFFENSE][DEFENSE][DROPS][PRIMARY][POWER][SKILLS]  |
+----------------------------------------------------+
|                                                  ▲ |
|  [🔫 Pulse Cannon                     EQUIPPED ] █ |
|  [   Reliable stream of energy shots           ] █ |
|  [                                             ] █ |
|  [🌧️ Storm Needles              💰1500  1 SP ] █ |
|  [   Rapid tiny shots with saturation          ] █ |
|  [                                             ] ░ |
|  [💥 Scatter Gun                 💰2000  2 SP ] ░ |
|  [   Shotgun burst, devastating up close       ] ░ |
|  [                                             ]   |
|                                                  ▼ |
+----------------------------------------------------+
|   Click items to purchase • SPACE to continue      |
+----------------------------------------------------+
```

- **Window**: max 600×500px, centered, `rgba(20, 20, 30, 0.95)` background, gold 3px border
- **Title**: "SHOP" in 32px Press Start 2P, gold (#FFD700)
- **Currency row**: Coin icon + gold amount, then blue SP amount, centered below title
- **6 tabs**: OFFENSE, DEFENSE, DROPS, PRIMARY, POWER, SKILLS — 28px tall, 9px Press Start 2P, color-coded
- **Item cards**: 100px tall, full width minus scrollbar, 12px vertical gap
- **Scrollbar**: 25px wide, gold thumb, gray track, arrow buttons top/bottom
- **Instructions**: 14px white text at bottom

### Item Card Anatomy

```
+---------------------------------------------------------------+
| [icon]  Item Name                        💰 cost  or  EQUIP  |
|  32px   16px bold "Press Start 2P"       14px bold, gold/red  |
|                                                               |
|         Description text here              Status: "Level 2"  |
|         12px gray "Press Start 2P"         or "OWNED" green   |
|                                           [SELL +150] (8px)   |
+---------------------------------------------------------------+
```

### Color States (Background / Border)

| State | Background | Border | Glow (hover) |
|-------|-----------|--------|--------------|
| Equipped | `rgba(0, 140, 200, 0.35)` | `#00AADD` | `rgba(0, 180, 255, 0.6)` |
| Owned (not equipped) | `rgba(0, 150, 80, 0.25)` | green | green glow |
| Affordable | `rgba(0, 255, 0, 0.2)` | `#00FF00` | `rgba(0, 255, 136, 0.6)` |
| Unaffordable | `rgba(255, 0, 0, 0.2)` | `#FF0000` | `rgba(255, 68, 68, 0.6)` |
| Maxed out | `rgba(100, 100, 100, 0.5)` | `#666666` | gray glow |

### Icons

All icons are **emoji characters** rendered at 32px via `fillText`:
- 🔫 Pulse Cannon, 🌧️ Storm Needles, 💥 Scatter Gun, ⚡ Rail Driver, 🔦 Lance Beam
- 🔋 Charge Shot, 💣 Mine Layer, 💫 Nova Blast, ⚡ Lightning Arc, 🚀 Missile Salvo
- 🛡️ Bulwark, 💚 Repair Nanites, 💨 Phase Dash, 🔮 Deflector Orbs, 📡 EMP Pulse, 🧲 Tractor Shield
- Various emojis for upgrades (🎯, ⚡, 🔁, 🌪️, ☠️, etc.)

### What's Missing / Broken

1. **No weapon stat display** — Players must guess DPS, range, fire rate from vague descriptions like "rapid tiny shots." No numbers, no bars, no comparison.
2. **Emoji icons are inconsistent** — Rendering varies wildly across platforms (iOS, Android, Windows, Linux). ⚡ is used for both Rail Driver AND Lightning Arc. 🔦 for Lance Beam is a flashlight, not a laser.
3. **No purchase feedback** — Clicking "buy" silently changes the item state. No animation, no sound, no confirmation flash.
4. **No stat comparison** — Hovering over a weapon doesn't show how it compares to the currently equipped weapon.
5. **9px tab text is barely readable** — "Press Start 2P" is a pixel font designed for 8px multiples; 9px renders blurry on canvas.
6. **6 tabs are cramped on mobile** — At 320-375px screen width, tabs become untappable.
7. **No scroll indicator** — Users don't know there's more content below without trying to scroll.
8. **Upgrade trees are flat lists** — No visual connection between weapon and its upgrades. No path structure.
9. **No visual difference between weapon-tier items and stat upgrades** — A primary weapon and a "+5% crit" upgrade look identical in the list.
10. **No "locked" visual for wave-gated weapons** — Just text saying "UNLOCKS: WAVE X" with no visual lockout.
11. **No hover tooltips** — Description is always visible but cramped into 2 lines with ellipsis truncation.
12. **Gold border on the shop window doesn't match the sci-fi aesthetic** — The game's HUD is cyan/blue, but the shop uses gold throughout.

---

## Shop UI — Industry Research

### How Great Games Present Their Shops

**Hades (Mirror of Night):**
- Vertical list, all items visible without scrolling (or minimal scroll)
- Dual-track system: each slot has an A/B toggle, keeping the list compact
- Rich art-deco aesthetic, gold accents, painterly backgrounds
- Currency displayed prominently at top
- Locked items show a key icon with unlock cost

**Vampire Survivors (Level-Up Selection):**
- 3-4 card-style options, vertically stacked, centered
- Icon + name + one-line description per card
- Already-owned items show "upgrade to next level" text
- Intentionally retro/minimalist
- Decision time: under 2 seconds

**Slay the Spire (Merchant):**
- Items in categorized rows (cards / relics / potions)
- Price below each item in gold text
- Rarity via card border color (gray/green/blue/gold)
- Card removal service offered (interesting "undo" mechanic)

**Ratchet & Clank (GrummelNet):**
- Weapon name, icon, price, and **stat bars** (damage, range, rate of fire, AoE)
- Per-weapon upgrade grid with **Raritanium** nodes surrounding each weapon
- Visual weapon model preview

**Deep Rock Galactic (Equipment Terminal):**
- 3D weapon model viewer on upgrade screen
- Modification nodes with clear prerequisite visualization
- Credits + crafting materials shown per upgrade

### Key Principles

1. **Scanability over density** — The three critical questions are: "What does it do?", "Can I afford it?", "Should I buy it?" Everything else is secondary.
2. **Stat bars > raw numbers** — Horizontal bars with green/red deltas are universally understood faster than reading DPS values.
3. **Visual hierarchy through size** — Weapons should be visually larger/more prominent than stat upgrades. They're a bigger decision.
4. **Purchase feedback is mandatory** — Gold flash, particle burst, "cha-ching" sound. The absence of feedback makes buying feel hollow.
5. **Progressive disclosure** — Show name + icon + price + one-line summary by default. Expand details on hover/tap.
6. **Consistent color language** — Use the same color coding everywhere (cyan = equipped, green = affordable, red = can't afford, gray = maxed).

---

## Shop UI — Redesign Plan

### Change 1: Replace Emoji Icons with Canvas-Drawn Weapon Silhouettes

Emoji icons are the single biggest aesthetic weakness. They render differently on every OS, some are indistinguishable at small sizes, and they don't match the game's sci-fi aesthetic.

**Replace with procedurally drawn icons** that match each weapon's in-game visual identity:

| Weapon | Icon Design (Canvas-drawn) |
|--------|---------------------------|
| Pulse Cannon | Small cyan circle with trailing line (energy bolt) |
| Storm Needles | Cluster of 5 small dashes radiating outward (needle spray) |
| Scatter Gun | Fan of 5 short lines from a point (shotgun cone) |
| Rail Driver | Single long magenta line with glow (rail beam) |
| Lance Beam | Thick green horizontal beam with width taper |
| Charge Shot | Pulsing circle with concentric rings |
| Mine Layer | Spiked circle (mine shape, matches Tangerine enemy) |
| Nova Blast | Expanding ring shape |
| Lightning Arc | Zigzag line between two points |
| Missile Salvo | Small rocket silhouette with trail |
| Bulwark | Shield shape (chevron/kite) |
| Repair Nanites | Cross/plus shape (medical) |
| Phase Dash | Arrow/chevron pointing right with motion lines |
| Deflector Orbs | Three small circles in orbit |
| EMP Pulse | Radiating concentric circles (pulse wave) |
| Tractor Shield | Forward-facing arc with inward arrows |

**Rendering approach:**
- 32×32px icon area, drawn with `ctx.beginPath()` / `ctx.stroke()` / `ctx.fill()`
- Use each weapon/skill's own color (`#00ccff` for Pulse, `#88ffff` for Storm, etc.)
- Add subtle glow via `ctx.shadowBlur = 4` in the weapon's color
- Cache each icon to an offscreen canvas (draw once, `drawImage` afterward)
- For upgrades: draw a smaller version of the parent weapon icon with a modifier badge (+ sign, arrow, star)

### Change 2: Add Weapon Stat Bars

When a weapon item is displayed in the shop, show 4 **horizontal stat bars** below the description:

```
+---------------------------------------------------------------+
| [⚡ icon]  Rail Driver                           💰 2500     |
|            Slow, powerful piercing rail shot       2 SP       |
|                                                               |
|   DMG  ████████████████░░░░  3.0     RATE ██░░░░░░░░░░░░░  S |
|   RNG  ████████████████████  1.5x    SPEC Piercing, Knockback|
+---------------------------------------------------------------+
```

**Stat bar specs:**
- 4 stats: **DMG** (damage per hit), **RATE** (fire rate, inverted — faster = more filled), **RNG** (range), **SPEC** (special text, no bar)
- Bar width: 80px, height: 6px
- Fill color: weapon's own color at 0.8 opacity
- Empty: `rgba(255, 255, 255, 0.15)`
- Value text: 10px, right-aligned after bar
- Position: bottom of the card, below description

**Comparison mode (hover):** When hovering over a weapon you don't own, show the currently equipped weapon's bars in a dimmer shade behind/above the new weapon's bars. Green arrow (▲) next to stats that improve, red arrow (▼) next to stats that decrease.

### Change 3: Visual Weapon Tier Separation

Currently, weapons and stat upgrades look identical in the item list. Weapons are a fundamentally bigger decision and should look bigger.

**Weapon cards: 120px tall** (vs 100px for upgrades):
- Larger icon area (40×40px vs 32×32px)
- Room for stat bars
- Thicker border (3px vs 2px)
- Subtle inner glow matching weapon color

**Upgrade cards: 80px tall** (reduced from 100px):
- Show parent weapon's icon as a small badge (16px) in the corner
- Stack progress indicator: filled dots (●●●○○ for 3/5 stacks)
- More compact — name + one-line description + cost

**Locked weapons: distinct locked visual:**
- Dark overlay with diagonal hash lines
- Lock icon (🔒 or drawn padlock) centered
- "WAVE X" text below lock icon in dim text
- Card is non-interactive (no hover glow)

### Change 4: Purchase Feedback

**On successful purchase:**
1. Item card flashes gold for 200ms (overlay `rgba(255, 215, 0, 0.4)`)
2. Small particle burst from the item (4-6 gold particles, outward arc, 300ms lifetime)
3. Currency display at top briefly flashes and ticks down (animated number decrease over 150ms)
4. SFXR "purchase" sound (ascending tone, coin-like)
5. If weapon: brief muzzle flash animation in the icon area

**On failed purchase (can't afford):**
1. Item card shakes horizontally (±3px, 200ms, 3 oscillations)
2. Card border briefly pulses brighter red
3. SFXR "error" buzz (low descending tone, 100ms)
4. Currency display at top flashes the insufficient currency in red

**On equip (free switch):**
1. Previous equipped card smoothly fades from cyan to green (owned)
2. New equipped card smoothly brightens to cyan
3. SFXR "equip" sound (metallic click/power-up whoosh)

### Change 5: Upgrade Path Visualization

When viewing a weapon's upgrades (after expanding the upgrade tree section), show the two divergent paths visually:

```
+--[ Rail Driver — Upgrades ]---------------------------+
|                                                        |
|  PATH A: Precision              PATH B: Devastation    |
|  ┌─────────────┐               ┌─────────────┐        |
|  │ Capacitor   │               │ Kinetic      │        |
|  │ 2x idle dmg │               │ Knockback    │        |
|  └──────┬──────┘               └──────┬──────┘        |
|         │                             │                |
|  ┌──────┴──────┐               ┌──────┴──────┐        |
|  │ Penetrator  │               │ Through&Thru │        |
|  │ +50% range  │               │ Damage trail │        |
|  └──────┬──────┘               └──────┴──────┘        |
|         │                             │                |
|  ┌──────┴──────┐               ┌──────┴──────┐        |
|  │ Armor Break │               │ Shockwave    │        |
|  │ -20% resist │               │ Pulse on hit │        |
|  └──────┬──────┘               └──────┬──────┘        |
|         │                             │                |
|  ┌──────┴──────┐               ┌──────┴──────┐        |
|  │ EXECUTIONER │               │ CATACLYSM   │        |
|  │ 3x <30% HP │               │ Double rail  │        |
|  └─────────────┘               └─────────────┘        |
+--------------------------------------------------------+
```

**Visual spec:**
- Two columns, each showing a linear upgrade path (top to bottom)
- Nodes: 100×40px rounded rectangles with upgrade name and one-line effect
- Connecting lines: 2px, weapon color, vertical between nodes
- Purchased nodes: filled with weapon color at 0.3 opacity, bright border
- Next available: glowing border (pulsing), full color text
- Locked (prerequisite not met): dimmed, dashed border
- Capstone (bottom node): slightly larger, name in ALL CAPS, stronger glow

**This replaces the current flat list of upgrades** with a visual tree that communicates progression, branching, and depth at a glance.

### Change 6: Color Palette Alignment

The shop currently uses gold (#FFD700) heavily — for the title, border, coin amounts, scrollbar thumb, and tab highlights. This clashes with the game's cyan/blue HUD aesthetic.

**Proposed palette shift:**
- **Shop border**: Cyan (`#00ccff`) instead of gold — matches HUD
- **Title "SHOP"**: Cyan with white outline, not gold
- **Tab active state**: Keep per-category colors (they're good), but use cyan as the default accent
- **Scrollbar thumb**: Cyan (`#00ccff`) instead of gold
- **Coin amounts**: Keep gold (it's the currency color, that's correct)
- **SP amounts**: Keep blue (correct)
- **Item borders**: Keep current state-based colors (green/red/cyan/gray — they work)

This shifts the shop from "gold and ornamental" to "holographic terminal" — consistent with the game's sci-fi identity.

### Change 7: Tab Improvements

**Current issues:** 6 tabs at 9px text is cramped, especially on mobile.

**Fixes:**
- Increase tab font to **10px** (divisible by 2, renders crisply for pixel fonts)
- On screens < 500px wide: use **icon-only tabs** with a colored dot + 2-letter abbreviation (OF, DE, DR, PR, PW, SK)
- Add **horizontal swipe** to switch tabs on mobile (supplement taps)
- Active tab: **underline bar** (3px, tab color) instead of just opacity change — clearer active indicator
- Add item count badge on each tab (small circle with number, e.g., "3" items available)

### Change 8: Scroll UX Improvements

- Replace arrow buttons with **elastic overscroll** (bounce at top/bottom limits)
- Add **scroll shadow** at top/bottom of content area when content extends beyond view (gradient fade `rgba(20, 20, 30, 0)` → `rgba(20, 20, 30, 1)` over 20px)
- **Snap-to-item scrolling** on touch (items shouldn't end up half-visible)
- Show a **"N more items below"** indicator when first opening a tab with scrollable content

### Change 9: Mobile Adaptations

- Item cards: keep 100px height (already touch-friendly)
- Close button (X): move to **bottom-right** on mobile (thumb zone) instead of top-left
- "Press SPACE to continue" → "Tap outside to close" on mobile
- Tabs: collapse to icon-only (see Change 7)
- Scrollbar: hide entirely on mobile (rely on touch scroll — scrollbar is a desktop affordance)

---

## Shop UI Implementation Plan

### Phase 1 — Visual Polish (Quick Wins)
1. Add purchase feedback (gold flash, shake on error, equip transition)
2. Add SFXR sounds for purchase/error/equip
3. Fix tab font size (9px → 10px)
4. Align shop border color with HUD (gold → cyan)
5. Add scroll shadows at content edges
6. Add item count badges to tabs

**Files:** `game-engine.js` (drawShop, drawShopItem), `utils.js` (SFXR calls)

### Phase 2 — Weapon Icons
1. Create canvas-drawn icon renderer for each weapon/skill type
2. Cache icons to offscreen canvases
3. Replace emoji `fillText` calls with `drawImage` from cache
4. Add upgrade badges (small modifier symbol on parent weapon icon)

**Files:** New `js/modules/weapon-icons.js`, `game-engine.js` (drawShopItem icon section)

### Phase 3 — Stat Bars & Comparison
1. Add stat bar rendering below weapon descriptions (DMG, RATE, RNG, SPEC)
2. Implement comparison overlay on hover (current vs hovered weapon)
3. Green/red delta arrows for stat changes
4. Increase weapon card height to 120px; decrease upgrade card height to 80px

**Files:** `game-engine.js` (drawShopItem), `weapon-data.js` (normalized stat values for bar rendering)

### Phase 4 — Upgrade Tree Visualization
1. Implement two-column path renderer for weapon upgrade trees
2. Node rendering with states (purchased, available, locked, capstone)
3. Connecting lines with weapon color
4. Replace flat upgrade list with tree view when weapon is selected

**Files:** `game-engine.js` (new drawUpgradeTree method), `weapon-data.js` (path structure data)

### Phase 5 — Mobile & Scroll Improvements
1. Icon-only tabs on small screens
2. Tab swipe navigation
3. Elastic overscroll / snap-to-item scrolling
4. Hide scrollbar on mobile
5. Move close button to bottom on mobile
6. Update instruction text for touch

**Files:** `game-engine.js` (drawShop, drawShopTabs, shop touch handlers), `css/styles.css` (responsive adjustments)

---

## Full Implementation Priority (Weapons + Shop Combined)

| Priority | Change | Phase | Effort |
|----------|--------|-------|--------|
| 1 | Free wave-milestone unlocks | Weapons Phase 1 | Low |
| 2 | Purchase/equip feedback (flash, sound, shake) | Shop Phase 1 | Low |
| 3 | Shop color alignment (gold → cyan) | Shop Phase 1 | Low |
| 4 | Tab font fix + item count badges | Shop Phase 1 | Low |
| 5 | Canvas-drawn weapon icons | Shop Phase 2 | Medium |
| 6 | Reduce upgrade costs ~30% | Weapons Phase 1 | Low |
| 7 | Stat bars + weapon comparison | Shop Phase 3 | Medium |
| 8 | Weapon/upgrade card size differentiation | Shop Phase 3 | Low |
| 9 | Expanded upgrade trees (6-8 nodes, two paths) | Weapons Phase 2 | High |
| 10 | Upgrade tree visualization | Shop Phase 4 | High |
| 11 | Pulse Cannon stat adjustment | Weapons Phase 2 | Low |
| 12 | Weapon mastery XP system | Weapons Phase 3 | Medium |
| 13 | Try-before-you-buy bonus wave | Weapons Phase 4 | Medium |
| 14 | Mobile shop adaptations | Shop Phase 5 | Medium |
| 15 | Scroll UX improvements | Shop Phase 5 | Low |
