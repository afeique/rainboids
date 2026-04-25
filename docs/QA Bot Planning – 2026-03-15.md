The QA Bot is an Ai that helps with testing.
# QA Bot — Research & Implementation Plan

## 1. Vision & Goals

### 1.1 Core Objectives

Build an autonomous AI playtester that can:

1. **Play Rainboids** end-to-end — navigate menus, fight through waves, use the shop, equip weapons, activate skills, and survive as long as possible
2. **Detect bugs** — crashes, visual glitches, stuck states, invalid game states, physics anomalies, audio issues
3. **Evaluate gameplay & balance** — pacing, difficulty curves, dominant strategies, useless upgrades, fun factor, learning curve
4. **Generate actionable reports** — structured output consumable by humans or downstream LLMs
5. **Play other WASD browser shooters** — generalize the bot to compare gameplay feel, balance, and design across games
6. **Simulate learning** — model the experience of a new player discovering mechanics, so insights reflect real player journeys

### 1.2 Why Not Just Extend the Existing GameAI?

The existing `tests/helpers/game-ai.js` is a reactive dodge-and-shoot loop. It has no:
- Strategic reasoning (shop decisions, build paths, skill usage)
- Perceptual analysis (visual quality, readability, juice/feel)
- Bug detection heuristics (state invariants, anomaly detection)
- Gameplay evaluation (is this fun? is this fair? is this boring?)
- Cross-game generalization (hardcoded to Rainboids' API)

The new bot needs **cognitive layers** on top of mechanical play.

---

## 2. Architecture

### 2.1 Layer Model

```
┌─────────────────────────────────────────────────┐
│  Layer 5: ANALYST (LLM)                         │
│  Gameplay evaluation, balance analysis,          │
│  cross-game comparison, report generation        │
├─────────────────────────────────────────────────┤
│  Layer 4: STRATEGIST (LLM + heuristics)         │
│  Shop decisions, build planning, skill usage,    │
│  goal-directed behavior, learning simulation     │
├─────────────────────────────────────────────────┤
│  Layer 3: BUG DETECTOR (rules + LLM)            │
│  State invariant checking, anomaly detection,    │
│  visual regression, crash monitoring             │
├─────────────────────────────────────────────────┤
│  Layer 2: PERCEPTION (state reader + vision)     │
│  Game state extraction, screenshot analysis,     │
│  entity tracking, event logging                  │
├─────────────────────────────────────────────────┤
│  Layer 1: MOTOR (Playwright + input injection)   │
│  Movement, aiming, firing, menu interaction,     │
│  shop navigation, skill activation               │
└─────────────────────────────────────────────────┘
```

### 2.2 Dual-Mode Perception

The bot operates in two complementary perception modes:

**Mode A: API-Direct (Rainboids-specific)**
- Read game state via `window.gameEngine` (player, enemies, bullets, wave, shop, etc.)
- Zero latency, perfect accuracy, full state access
- Used for mechanical play, bug detection, and state tracking
- Not portable to other games

**Mode B: Vision + Accessibility (Cross-game portable)**
- Playwright screenshots at configurable intervals (e.g., 2-5 Hz)
- Screenshots sent to a vision LLM (Claude) for scene understanding
- Extracts: player position, enemy count/types, HUD values, visual quality, screen composition
- Portable to any browser game rendered on canvas or DOM
- Used for gameplay feel evaluation, visual bug detection, cross-game comparison

For Rainboids, both modes run simultaneously. Mode A drives gameplay; Mode B provides the "player experience" perspective. For other games, only Mode B is available.

### 2.3 Component Breakdown

```
ai-qa-bot/
├── core/
│   ├── bot-runner.js          # Orchestrator — runs play sessions
│   ├── session-logger.js      # Structured event/state log per session
│   └── config.js              # Bot configuration (game URL, mode, duration, etc.)
│
├── motor/
│   ├── input-driver.js        # Abstract input interface (move, aim, fire, skill, menu)
│   ├── rainboids-driver.js    # Rainboids-specific: direct inputHandler.input injection
│   └── generic-driver.js      # Cross-game: keyboard/mouse events via Playwright
│
├── perception/
│   ├── state-reader.js        # API-direct state extraction (Rainboids)
│   ├── vision-reader.js       # Screenshot → LLM → structured scene description
│   ├── event-detector.js      # Detects game events (kill, damage, wave change, death, shop open)
│   └── entity-tracker.js      # Tracks entities across ticks (for velocity, patterns, etc.)
│
├── strategy/
│   ├── combat-ai.js           # Tactical: dodge, aim, prioritize targets (enhanced from GameAI)
│   ├── shop-ai.js             # Strategic: build paths, upgrade priorities, weapon selection
│   ├── skill-ai.js            # Skill activation timing (when to use Bulwark, Phase Dash, etc.)
│   ├── exploration-ai.js      # Systematic exploration of game mechanics and edge cases
│   └── learning-sim.js        # Simulates player learning curve (see §4.4)
│
├── detection/
│   ├── invariant-checker.js   # State invariant assertions (health >= 0, valid states, etc.)
│   ├── anomaly-detector.js    # Statistical anomaly detection on game metrics
│   ├── visual-checker.js      # Visual regression and glitch detection via screenshots
│   ├── performance-monitor.js # FPS drops, frame hitches, memory leaks
│   └── stuck-detector.js      # Detects stuck states (no progress for N seconds)
│
├── analysis/
│   ├── balance-analyzer.js    # Weapon/upgrade effectiveness, dominant strategies
│   ├── pacing-analyzer.js     # Difficulty curve, engagement over time, downtime
│   ├── economy-analyzer.js    # Money/SP flow, shop pricing fairness, progression rate
│   ├── comparison-engine.js   # Cross-game comparison framework
│   └── report-generator.js    # Structured report output (JSON + Markdown)
│
└── reports/
    └── (generated per session)
```

---

## 3. Implementation Phases

### Phase 1: Enhanced Mechanical Play (Week 1-2)

**Goal**: Bot can play through 20+ waves, use the shop intelligently, activate skills.

**Tasks**:

1. **Refactor existing GameAI** into the motor/combat-ai layer
   - Extract the dodge/aim/fire logic from `tests/helpers/game-ai.js`
   - Add skill activation (use defensive skills when threatened)
   - Add secondary fire (power weapon usage with timing)
   - Improve target prioritization (Titans > Prowlers > swarms)

2. **Build shop-ai.js**
   - Define build archetypes: "DPS" (offense-heavy), "Tank" (defense-heavy), "Balanced", "Economy" (drops-focused)
   - Decision tree for upgrade purchases based on current wave, money, SP, owned upgrades
   - Weapon selection logic: try different primaries/powers across sessions
   - Skill selection and slot assignment

3. **Build state-reader.js**
   - Wrap `window.gameEngine` access into a clean state snapshot interface
   - Track state deltas between ticks (what changed?)
   - Build event stream from state deltas (enemy spawned, enemy died, player hit, wave ended, etc.)

4. **Build session-logger.js**
   - Log every game event with timestamp, wave, player state
   - Log every bot decision with reasoning
   - Log performance metrics (FPS, entity counts)
   - Output as structured JSON (one file per session)

**Validation**: Bot survives 20+ waves with shop usage. Session logs are complete and parseable.

### Phase 2: Bug Detection (Week 2-3)

**Goal**: Bot systematically finds bugs during play sessions.

**Tasks**:

1. **invariant-checker.js** — continuous assertions during play:
   - `player.health >= 0 && player.health <= player.maxHealth`
   - `game.state ∈ {PLAYING, PAUSED, GAME_OVER, WAVE_TRANSITION, SHOP, TITLE_SCREEN}`
   - `game.money >= 0`, `game.lives >= 0`
   - `game.currentWave` monotonically increases (never decreases)
   - All pool objects have valid positions (`isFinite(x) && isFinite(y)`)
   - No entity has NaN in any numeric field
   - Enemy health > 0 for all active enemies
   - Player position within game field bounds (with tolerance)
   - Bullet pool size doesn't grow unbounded
   - No duplicate entities in pools (same `_poolIndex`)

2. **anomaly-detector.js** — statistical monitoring:
   - Track metrics over sliding windows: kill rate, damage taken rate, money earned rate
   - Flag if any metric deviates > 3σ from its running mean
   - Detect "damage spikes" (player takes excessive damage in one tick)
   - Detect "invulnerability bugs" (player takes no damage despite nearby threats for too long)
   - Detect "economy breaks" (money changes by impossible amounts)

3. **stuck-detector.js**:
   - If wave doesn't progress for 60 seconds, flag as stuck
   - If player position hasn't changed for 10 seconds during PLAYING, flag
   - If shop is open but no items are purchasable and wave timer isn't progressing, flag
   - If enemy count is 0 but wave hasn't ended, flag

4. **performance-monitor.js**:
   - Sample FPS every second via `requestAnimationFrame` timing
   - Flag sustained drops below 30 FPS
   - Track entity pool sizes — flag if any pool exceeds expected maximums
   - Monitor for memory growth (if available via `performance.memory`)

5. **JS error capture**:
   - Listen for `page.on('pageerror')` and `page.on('console', 'error')`
   - Correlate errors with game state at time of occurrence

**Validation**: Run 10 sessions of 10 minutes each. All known bugs are detected. Zero false positives on invariant checks.

### Phase 3: Vision & Cross-Game Support (Week 3-5)

**Goal**: Bot can perceive and play games through screenshots alone.

**Tasks**:

1. **vision-reader.js** — screenshot analysis pipeline:
   - Capture screenshots at 2 Hz during gameplay (every 500ms)
   - Send to Claude vision API with structured prompts:
     ```
     Analyze this game screenshot. Return JSON:
     {
       "player": { "position": "center-left", "health_bar_pct": 80, "visible": true },
       "enemies": { "count": 3, "types_visible": ["red ship", "green tank"], "nearest_direction": "upper-right" },
       "bullets": { "density": "medium", "threat_direction": "right" },
       "hud": { "score": "12450", "wave": "5", "money": "340" },
       "game_state": "playing",
       "visual_issues": ["overlapping UI elements", "text clipping"],
       "screen_composition": "busy but readable"
     }
     ```
   - Cache and diff sequential frames to detect changes
   - Rate-limit API calls (budget-aware)

2. **generic-driver.js** — keyboard/mouse control via Playwright:
   - `page.keyboard.down('w')` / `page.keyboard.up('w')` for movement
   - `page.mouse.move(x, y)` for aiming
   - `page.mouse.down()` / `page.mouse.up()` for firing
   - Abstract interface matching rainboids-driver.js so strategy layer is game-agnostic

3. **Game adapter pattern**:
   - Each game gets a thin adapter: `{ url, viewport, controls, stateExtractor? }`
   - Rainboids adapter uses API-direct mode + vision
   - Other games use vision-only mode
   - Adapter specifies key bindings (WASD, click-to-fire, etc.)

4. **Visual bug detection** (visual-checker.js):
   - Screenshot diffing between frames for unexpected visual changes
   - LLM-based visual QA: "Does this screenshot show any visual bugs? (z-order issues, clipping, artifacts, missing elements, broken animations)"
   - Baseline comparison: capture "known good" screenshots per wave/state for regression

**Validation**: Bot plays Rainboids in vision-only mode and survives 5+ waves. Bot can load and attempt to play at least one other browser shooter.

### Phase 4: Gameplay & Balance Analysis (Week 5-7)

**Goal**: Bot generates meaningful gameplay and balance insights.

**Tasks**:

1. **balance-analyzer.js** — multi-session statistical analysis:
   - Run N sessions with different build archetypes (DPS, Tank, Balanced, Economy)
   - Track per-weapon stats: kills, damage dealt, accuracy, DPS achieved
   - Track per-upgrade stats: purchase frequency, impact on survival time
   - Identify dominant strategies: which build survives longest? Which clears fastest?
   - Identify underperforming items: upgrades that are never worth buying
   - Identify overpowered items: upgrades that trivialize content
   - Compare weapon effectiveness: "Storm Needles outperforms Pulse Cannon by 3x DPS after wave 10"

2. **pacing-analyzer.js** — engagement curve analysis:
   - Track "action density" per wave (enemies fought, bullets dodged, skills used per minute)
   - Identify downtime: periods where nothing threatening is happening
   - Identify spike difficulty: waves where death rate jumps dramatically
   - Track shop time: how long does the bot spend in shop? (proxy for decision complexity)
   - Wave-over-wave difficulty curve: smooth ramp vs. jarring jumps

3. **economy-analyzer.js** — progression analysis:
   - Money earned per wave vs. upgrade costs: can players afford meaningful upgrades?
   - SP earn rate vs. SP costs: are skill points too scarce/abundant?
   - Time-to-first-weapon-buy: how many waves before a player can afford a new weapon?
   - Upgrade depth: how many stacks of each upgrade does a player typically buy?
   - "Dead money" detection: money accumulated with nothing useful to spend it on

4. **Learning curve simulation** (learning-sim.js):
   - Play sessions with intentionally degraded skill (delayed reactions, imperfect aim, no dodging)
   - Gradually improve skill parameters over sessions to simulate learning
   - Track: when does the player first die? First reach wave 5? First buy an upgrade?
   - Identify "aha moments": when does a mechanic first become useful?
   - Identify "frustration points": deaths that feel unavoidable at low skill levels
   - Skill levels to simulate:
     - **Novice**: 500ms reaction time, random aim, no skill usage, no shop awareness
     - **Beginner**: 300ms reaction, aims at nearest enemy, basic shop usage
     - **Intermediate**: 200ms reaction, prioritized targeting, strategic shop builds
     - **Advanced**: 100ms reaction, optimal play, full build optimization

**Validation**: Generate balance report showing weapon tier list, upgrade value ranking, and difficulty curve analysis. Results are reproducible across runs.

### Phase 5: Cross-Game Comparison & Deep Insights (Week 7-9)

**Goal**: Bot plays other games and generates comparative insights.

**Tasks**:

1. **comparison-engine.js** — cross-game analysis framework:
   - Define universal gameplay metrics (applicable to any WASD shooter):
     - **Responsiveness**: input-to-action latency feel (measured via vision frame analysis)
     - **Visual clarity**: can you tell what's happening? (LLM rates screenshots)
     - **Threat readability**: can you tell what's dangerous? (LLM rates combat screenshots)
     - **Pacing**: action density over time
     - **Progression feel**: does getting stronger feel meaningful?
     - **Death fairness**: were deaths avoidable with skill?
     - **Strategic depth**: number of viable build paths / playstyles
     - **Juiciness**: screen shake, particles, sound (rated by LLM from screenshots + audio analysis)
   - Compare Rainboids against 2-3 reference games on each metric

2. **Game adapters** for reference games:
   - Identify 2-3 publicly playable browser WASD shooters (e.g., Asteroid-style games, arena shooters)
   - Write thin adapters with control mappings
   - Run standardized play sessions (5-10 minutes each)

3. **Comparative report generation**:
   - Side-by-side metric comparison tables
   - Qualitative LLM analysis: "Rainboids has stronger visual feedback than Game X but weaker enemy variety signaling"
   - Specific improvement suggestions derived from comparison

**Validation**: Comparative report covering Rainboids vs. 2 other games with actionable insights.

### Phase 6: Report System & CI Integration (Week 9-10)

**Goal**: Reports are production-quality and integrated into dev workflow.

**Tasks**:

1. **report-generator.js** — structured output:
   ```
   reports/
   ├── session-2026-03-15-001/
   │   ├── session.json          # Raw event log
   │   ├── bugs.json             # Detected bugs with severity/reproduction steps
   │   ├── balance.json          # Per-weapon/upgrade statistics
   │   ├── gameplay.json         # Pacing, difficulty, economy metrics
   │   └── summary.md            # Human-readable summary
   ├── aggregate/
   │   ├── balance-report.md     # Multi-session balance analysis
   │   ├── bug-report.md         # All bugs found across sessions
   │   ├── gameplay-report.md    # Gameplay quality assessment
   │   └── comparison-report.md  # Cross-game comparison
   └── latest.md                 # Most recent session summary
   ```

2. **Bug report format** (machine + human readable):
   ```json
   {
     "id": "BUG-001",
     "severity": "high",
     "category": "state_invariant",
     "title": "Player health exceeds maxHealth after level-up healing",
     "description": "...",
     "reproduction": {
       "wave": 12,
       "timestamp_ms": 45230,
       "player_state": { ... },
       "steps": ["Reach level 4", "Level-up grants +5 HP", "Health becomes 105/100"]
     },
     "screenshot": "bug-001.png",
     "frequency": "every_3rd_level_up"
   }
   ```

3. **npm scripts**:
   ```
   npm run qa:bot             # Run one 10-minute session, generate report
   npm run qa:bot:balance     # Run 10 sessions with varied builds, generate balance report
   npm run qa:bot:bugs        # Run 5 sessions focused on bug detection (stress + edge cases)
   npm run qa:bot:compare     # Run cross-game comparison suite
   npm run qa:bot:full        # Full analysis (all of the above)
   ```

4. **CI integration** (optional):
   - Run `qa:bot:bugs` on every PR (5-minute quick session)
   - Run `qa:bot:balance` weekly
   - Post summary as PR comment or Allure report attachment

---

## 4. Key Technical Decisions

### 4.1 LLM Usage Strategy

The bot uses LLM calls at two frequencies:

**High-frequency (every few seconds) — Strategist layer**:
- Shop purchase decisions (which item to buy?)
- Skill activation timing (should I use Bulwark now?)
- These can use a fast, cheap model (Claude Haiku) with structured prompts
- Alternative: replace with heuristic decision trees to avoid API costs during play

**Low-frequency (post-session) — Analyst layer**:
- Balance analysis from aggregated statistics
- Gameplay quality assessment from session logs + screenshots
- Cross-game comparison from captured data
- These use a capable model (Claude Opus/Sonnet) for nuanced analysis
- Cost is bounded: ~10-20 calls per analysis run

**Recommended approach**: Use heuristics for real-time strategy (no LLM calls during play), LLM for post-session analysis. This keeps play sessions fast, deterministic, and free of API latency.

### 4.2 Vision Pipeline Design

For cross-game play and visual quality assessment:

```
Screenshot (1280x720 PNG)
    ↓
Downsample to 640x360 (reduce token cost)
    ↓
Send to Claude Vision with structured prompt
    ↓
Parse JSON response → scene understanding
    ↓
Feed to strategy layer / visual checker
```

**Cost management**:
- Vision calls are expensive (~$0.01-0.05 per screenshot)
- During play: capture at 2 Hz but only send to LLM at 0.2 Hz (every 5 seconds)
- Between LLM calls: use pixel-level heuristics (brightness, color histograms, motion detection via frame diff)
- Budget cap per session (e.g., max 100 vision calls = ~$5)

### 4.3 State Extraction for Rainboids

The `state-reader.js` module captures a complete snapshot via `page.evaluate()`:

```javascript
// Snapshot structure (captured every 100ms)
{
  timestamp: Date.now(),
  wave: game.currentWave,
  state: game.state,
  player: {
    x, y, health, maxHealth, shield, level, skillPoints,
    activePrimary, activePower, skillSlots,
    powerups: Map → Object, velocity: { x, y }
  },
  entities: {
    asteroids: [{ x, y, radius, health }],
    enemies: [{ x, y, type, level, health, maxHealth }],
    enemyBullets: [{ x, y, vx, vy }],
    playerBullets: count,
    powerups: [{ x, y, type }],
    orbs: [{ x, y, type }]
  },
  economy: { money, lives },
  performance: { fps, entityCounts },
  events: [] // derived from state deltas
}
```

### 4.4 Learning Simulation Model

To simulate a player's learning journey:

```
Session 1 (Novice):
  - reactionDelay: 500ms
  - aimAccuracy: 0.3 (aim offset up to 70% of distance)
  - dodgeProbability: 0.2 (only dodge 20% of threats)
  - shopStrategy: "random" (buy random affordable items)
  - skillUsage: false

Session 5 (Beginner):
  - reactionDelay: 300ms
  - aimAccuracy: 0.5
  - dodgeProbability: 0.5
  - shopStrategy: "cheapest" (buy cheapest available)
  - skillUsage: false

Session 10 (Intermediate):
  - reactionDelay: 200ms
  - aimAccuracy: 0.7
  - dodgeProbability: 0.7
  - shopStrategy: "heuristic" (follow a build path)
  - skillUsage: true (use when health < 50%)

Session 20 (Advanced):
  - reactionDelay: 100ms
  - aimAccuracy: 0.9
  - dodgeProbability: 0.9
  - shopStrategy: "optimal" (calculated best purchase)
  - skillUsage: true (proactive usage)
```

Each session logs the skill parameters alongside game results, creating a learning curve dataset.

### 4.5 Cross-Game Adapter Interface

```javascript
// Game adapter interface
{
  name: "Rainboids",
  url: "http://localhost:8090",
  viewport: { width: 1280, height: 720 },

  // Controls
  controls: {
    up: "w", down: "s", left: "a", right: "d",
    fire: "mouse_left", secondary: "mouse_right",
    skills: ["1", "2", "3", "4"],
    pause: "Escape"
  },

  // Optional: direct state access (Rainboids only)
  stateExtractor: async (page) => { /* return snapshot */ },

  // Start sequence (get from menu to gameplay)
  startSequence: async (page) => {
    await page.click('canvas');
    await page.waitForTimeout(500);
  },

  // How to detect game states from vision
  stateSignals: {
    playing: "game field with player ship visible",
    paused: "pause menu overlay",
    gameOver: "game over text visible",
    shop: "shop interface with items"
  }
}
```

---

## 5. Bug Detection Strategies

### 5.1 Categories

| Category | Method | Example Bugs |
|----------|--------|-------------|
| **Crash** | `pageerror` listener | Uncaught TypeError, null reference |
| **State invariant** | Continuous assertions | Health > maxHealth, negative money |
| **Stuck state** | Progress monitoring | Wave won't end, shop won't close |
| **Visual glitch** | Screenshot + LLM analysis | Z-order issues, clipping, artifacts |
| **Physics anomaly** | Entity tracking | Teleportation, infinite velocity, wall clipping |
| **Balance exploit** | Statistical analysis | Invincibility combos, infinite money |
| **Performance** | FPS monitoring | Sustained drops, memory leaks |
| **Audio** | Event correlation | Missing sounds, overlapping audio |
| **UX** | Learning sim + LLM | Confusing UI, unresponsive controls |

### 5.2 Exploration Strategies

The bot should systematically explore edge cases:

1. **Rapid shop cycling**: Open/close shop repeatedly during wave transitions
2. **Max stacking**: Buy maximum stacks of every upgrade
3. **Weapon switching under fire**: Switch weapons during combat
4. **Skill spam**: Activate all 4 skills simultaneously
5. **Edge-of-field play**: Stay near boundaries for extended periods
6. **AFK testing**: Stop all input during combat (test death/game-over flow)
7. **Pause spam**: Rapidly toggle pause during various states
8. **Long sessions**: Play 50+ waves to test late-game stability
9. **Speed runs**: Rush through waves as fast as possible
10. **Pacifist runs**: Avoid killing enemies, test timeouts and auto-progression

---

## 6. Balance & Gameplay Analysis Framework

### 6.1 Metrics Collected Per Session

```javascript
{
  // Survival
  wavesReached: 15,
  totalSurvivalTime: 420000, // ms
  deaths: 3,
  deathWaves: [8, 12, 15],

  // Combat
  totalKills: 87,
  killsByEnemyType: { HUNTER: 30, GUARDIAN: 12, ... },
  totalDamageDealt: 4500,
  totalDamageTaken: 280,
  accuracy: 0.45, // bullets hit / bullets fired
  skillActivations: { BULWARK: 5, PHASE_DASH: 12 },

  // Economy
  totalMoneyEarned: 8500,
  totalMoneySpent: 7200,
  totalSPEarned: 12,
  totalSPSpent: 8,
  upgradesPurchased: ["RAPID_FIRE", "RAPID_FIRE", "HEALTH_BOOST", ...],
  weaponsBought: ["STORM_NEEDLES"],

  // Build
  finalBuild: {
    primary: "STORM_NEEDLES",
    power: "CHARGE_SHOT",
    skills: ["BULWARK", "PHASE_DASH", null, null],
    upgrades: { RAPID_FIRE: 2, HEALTH_BOOST: 1, ... }
  },

  // Pacing
  actionDensityPerWave: [12, 18, 25, ...], // events per minute
  shopTimePerWave: [5000, 3000, 8000, ...], // ms spent in shop
  downtimePercentage: 0.15, // % of time with no threats on screen
}
```

### 6.2 Analysis Outputs

**Weapon Tier List** (from multi-session data):
```
S-tier: Storm Needles (highest sustained DPS, best survival correlation)
A-tier: Scatter Gun (strong in early waves, falls off late)
B-tier: Pulse Cannon (adequate but outclassed), Rail Driver
C-tier: Lance Beam (situational, high skill requirement)
```

**Upgrade Value Ranking** (cost-effectiveness):
```
1. RAPID_FIRE — +15% DPS per stack, cheap, always useful
2. HEALTH_BOOST — +10 HP is huge early game
3. SPEED_BOOST — dodging is the best defense
...
12. HIGH_ROLLER — marginal money increase, SP-gated
```

**Difficulty Curve**:
```
Wave 1-5:  Easy (0.1 deaths/wave average)
Wave 6-10: Moderate ramp (0.3 deaths/wave)
Wave 11:   Spike! (0.8 deaths/wave) — first TITAN encounter
Wave 12-15: Plateau (0.4 deaths/wave)
Wave 16-20: Sharp ramp (0.7 deaths/wave) — duo encounters
```

### 6.3 Gameplay Quality Assessment (LLM-Generated)

Post-session, feed the session log + key screenshots to Claude for qualitative analysis:

```
Prompt: You are a game design consultant analyzing a play session of
"Rainboids", a browser-based arcade shooter. Here is the session data
and key screenshots. Evaluate:

1. PACING: Was the action density consistent? Any boring stretches or
   overwhelming spikes?
2. PROGRESSION: Did upgrades feel meaningful? Was there a satisfying
   power curve?
3. CLARITY: Could you always tell what was happening on screen?
4. FAIRNESS: Were deaths avoidable with skill, or did they feel random?
5. ENGAGEMENT: What kept you playing? What made you want to stop?
6. SUGGESTIONS: Top 3 specific, actionable improvements.

Respond with structured JSON.
```

---

## 7. Report Format

### 7.1 Bug Report (bugs.json → bugs.md)

```markdown
# Bug Report — Session 2026-03-15-001

## Critical (0)
(none)

## High (2)

### BUG-001: Player health exceeds maxHealth after level-up
- **Wave**: 12 | **Time**: 45.2s
- **State**: health=105, maxHealth=100
- **Repro**: Reach level 4 with health at 98. Level-up grants +5 HP,
  pushing health above cap.
- **Expected**: Health should be clamped to maxHealth after healing.

### BUG-002: Enemy bullets persist after enemy death
- **Wave**: 8 | **Time**: 32.1s
- **State**: 3 enemy bullets from dead GUARDIAN still active
- **Note**: Bullets should despawn or continue naturally — verify
  this is intentional behavior.

## Medium (1)

### BUG-003: Shop scroll position resets on category switch
- **Wave**: 5 (shop) | **Time**: 28.0s
- **Observation**: Switching from OFFENSE to DEFENSE and back resets
  scroll to top.

## Low (0)
(none)
```

### 7.2 Balance Report (balance.md)

```markdown
# Balance Report — 10 Sessions, Mixed Builds

## Weapon Effectiveness
| Weapon | Avg DPS | Survival Correlation | Pick Rate | Verdict |
|--------|---------|---------------------|-----------|---------|
| Storm Needles | 145 | +22% | 40% | Strong |
| Pulse Cannon | 85 | baseline | 30% | Adequate |
| Scatter Gun | 120 | +8% | 20% | Good early |
| Rail Driver | 95 | +5% | 8% | Niche |
| Lance Beam | 60 | -12% | 2% | Undertuned |

## Key Findings
1. **Storm Needles dominates**: 40% higher DPS than Pulse Cannon with
   no meaningful downside. Consider reducing fire rate or damage.
2. **Lance Beam underperforms**: Requires precise aim but deals less
   total damage than auto-aim weapons. Needs a unique strength.
3. **HEALTH_BOOST is mandatory**: Sessions without it die 2x faster.
   Consider giving baseline HP increase per wave.

## Economy
- Average money at wave 10: $3,400 (enough for ~2 upgrades)
- First weapon purchase possible at wave: 6-8
- SP feels scarce: average 1.2 SP per death, skills cost 3-5 SP
```

### 7.3 Gameplay Report (gameplay.md)

```markdown
# Gameplay Report — Session 2026-03-15-001

## Summary
Played 15 waves in 7 minutes. Died 3 times. Build: Storm Needles +
Rapid Fire x2 + Health Boost.

## Pacing
- Waves 1-4: Smooth introduction, low threat, adequate time to learn.
- Wave 5-6: Good ramp with WASP introduction.
- Wave 7: Brief lull — only asteroids, feels like filler.
- Wave 11: Major spike (TITAN). First death felt unavoidable for a
  new player — Titan's sweep laser covers too much area.
- Shop breaks: Average 4s. Appropriate length.

## Learning Curve Assessment
- Movement + shooting: Intuitive from wave 1.
- Dodging: Essential by wave 3, learned through deaths.
- Shop system: First encounter is overwhelming — 6 tabs, many items.
- Skills: Not obvious how to use (number keys). Suggest tutorial prompt.
- Weapon switching: Discoverable but not explained.

## Fun Factor: 7/10
- Strengths: Satisfying weapon feel, good enemy variety, beautiful
  starfield.
- Weaknesses: Shop is complex for first-time players, some waves feel
  like filler, skill system is hidden.
```

---

## 8. Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Browser automation | Playwright | Already in use, excellent API, screenshot support |
| Game interaction | `page.evaluate()` | Direct state access, zero latency |
| Vision analysis | Claude Vision API | Best multimodal reasoning, structured output |
| Strategy decisions | Heuristic trees | No API latency during play, deterministic |
| Post-session analysis | Claude API (Sonnet/Opus) | Nuanced qualitative analysis |
| Test runner | Playwright Test or custom Node.js | Integrates with existing test infra |
| Data storage | JSON files | Simple, diffable, no dependencies |
| Reports | Markdown + JSON | Human and machine readable |
| Cross-game screenshots | Playwright `page.screenshot()` | Built-in, reliable |

### 8.1 Dependencies (New)

```json
{
  "@anthropic-ai/sdk": "latest",  // Claude API for vision + analysis
}
```

No other new dependencies. Everything else uses Playwright (already installed) and Node.js stdlib.

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM vision latency (2-5s per call) | Bot can't react in real-time via vision | Use API-direct mode for gameplay; vision for async analysis only |
| API costs for vision-heavy sessions | $5-50 per full analysis run | Budget caps, downsampled images, selective capture |
| Cross-game bot can't learn controls | Fails to play other games | Standardized adapter interface; manual control mapping per game |
| False positive bugs from timing | Floods reports with non-bugs | Require 2+ occurrences before reporting; severity thresholds |
| Flaky play sessions (random deaths) | Inconsistent balance data | Run 10+ sessions per analysis; statistical significance tests |
| Balance analysis reflects bot skill, not human skill | Misleading recommendations | Learning simulation at multiple skill levels; weight novice experience |

---

## 10. Success Criteria

### Minimum Viable Product (Phase 1-2)
- [ ] Bot plays 20+ waves with intelligent shop usage
- [ ] Bot detects at least 3 categories of bugs automatically
- [ ] Session logs are complete, structured, and parseable
- [ ] Bug reports include reproduction steps and severity

### Full System (Phase 3-6)
- [ ] Bot plays Rainboids in vision-only mode
- [ ] Bot plays at least 2 other browser shooters via vision
- [ ] Balance report with weapon tier list and upgrade rankings
- [ ] Gameplay report with pacing analysis and learning curve assessment
- [ ] Cross-game comparison report with actionable insights
- [ ] Reports are CI-integratable (npm scripts, exit codes, artifacts)
- [ ] Learning simulation produces consistent, reproducible curves

---

## 11. Research References

- [TITAN: LLM-Driven MMORPG Testing](https://arxiv.org/html/2509.22170v1) — First LLM-driven game testing framework, 95% task success rate, deployed in 8 production pipelines
- [GamingAgent (ICLR 2026)](https://github.com/lmgame-org/GamingAgent) — LLM/VLM gaming agents with standardized evaluation across Sokoban, Tetris, Candy Crush, Mario
- [GAMEBoT (ACL 2025)](https://visual-ai.github.io/gamebot/) — LLM reasoning assessment through game play with transparent strategy analysis
- [Playwright MCP for AI Testing](https://alexop.dev/posts/building_ai_qa_engineer_claude_code_playwright/) — Claude Code + Playwright integration patterns for automated QA
- [Playwright Computer Use](https://github.com/invariantlabs-ai/playwright-computer-use) — Claude controlling browsers via Playwright for autonomous testing
- [AI-Powered Playtesting for Game Balance](https://www.wayline.io/blog/ai-powered-playtesting-revolutionizing-game-balance) — Industry overview of AI balance testing (EA, Ubisoft case studies)
- [lmgame-Bench](https://arxiv.org/html/2505.15146v1) — Evaluating LLM game-playing ability with vision scaffolds


