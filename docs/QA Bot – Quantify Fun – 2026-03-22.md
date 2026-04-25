# QA Bot: Quantifying Fun

> Research, analysis, and implementation plan for extending the Rainboids AI QA Bot to measure, score, and optimize "fun" — turning subjective gameplay experience into actionable, quantifiable metrics.

---

## Table of Contents

1. [Research: What Makes a Game "Fun"?](#1-research-what-makes-a-game-fun)
2. [From Theory to Telemetry: Measurable Proxies](#2-from-theory-to-telemetry-measurable-proxies)
3. [Current QA Bot Capabilities](#3-current-qa-bot-capabilities)
4. [The Fun Metrics Framework](#4-the-fun-metrics-framework)
5. [Implementation Plan](#5-implementation-plan)
6. [The Fun Score: Composite Index](#6-the-fun-score-composite-index)
7. [The Optimization Loop](#7-the-optimization-loop)
8. [Research Sources](#8-research-sources)

---

## 1. Research: What Makes a Game "Fun"?

### 1.1 Flow Theory (Csikszentmihalyi, 1990)

The foundational framework. Flow is the state of optimal experience — complete immersion where challenge and skill are in balance. Csikszentmihalyi's Three-Channel Model maps the relationship:

```
Challenge ↑
         │     ANXIETY
         │      (too hard)
         │
         │         FLOW
         │      (optimal)
         │
         │     BOREDOM
         │      (too easy)
         └──────────────→ Skill
```

**Key insight for measurement:** Flow is destroyed by both boredom (insufficient challenge) AND anxiety (excessive challenge). The bot can detect both states through proxy signals — action density dropping (boredom) or death rate spiking (anxiety).

**Flow prerequisites** (all measurable):
- **Clear goals** — Does the player know what to do? (Proxy: time spent idle)
- **Immediate feedback** — Does the game respond to actions? (Proxy: hit/miss ratio responsiveness)
- **Challenge-skill balance** — Is the difficulty appropriate? (Proxy: death rate, wave clear time, damage ratios)

### 1.2 GameFlow Model (Sweetser & Wyeth, 2005)

An operationalization of Csikszentmihalyi for games. Eight dimensions of enjoyment, each with measurable criteria:

| Dimension | Description | Measurable By Bot? |
|-----------|-------------|-------------------|
| **Concentration** | Game demands attention, no distractions | Yes — action density, threat proximity, input frequency |
| **Challenge** | Difficulty matches skill, increases at appropriate pace | Yes — death rate, wave clear time, damage-taken trends |
| **Player Skills** | Player develops mastery over time | Yes — accuracy improvement, dodge success rate over waves |
| **Control** | Player has agency, movement feels responsive | Partial — input-to-action latency (FPS), movement freedom |
| **Clear Goals** | Player knows what to do next | Indirect — idle time, directionless movement patterns |
| **Feedback** | Player sees results of actions immediately | Yes — hit confirmation rate, visual event density |
| **Immersion** | Player is absorbed, loses track of time | Indirect — session duration, voluntary continuation |
| **Social Interaction** | N/A for single-player Rainboids | N/A |

**Key insight:** Seven of eight dimensions have observable proxy signals that an automated bot can collect. The bot doesn't need to *feel* fun — it needs to measure the *conditions* that produce fun.

### 1.3 Self-Determination Theory / PENS (Ryan, Rigby & Przybylski, 2006)

The Player Experience of Need Satisfaction model identifies three psychological needs that drive intrinsic motivation in games:

| Need | Description | Bot Proxy |
|------|-------------|-----------|
| **Competence** | Feeling skilled and effective | Kill rate, accuracy, damage output trends, wave clear speed |
| **Autonomy** | Meaningful choices with real impact | Upgrade variety, weapon switching frequency, build diversity |
| **Relatedness** | N/A for single-player | N/A |

**Key insight for Rainboids:** Competence is the dominant driver. The bot should measure whether the player (AI agent) feels increasingly effective as it upgrades — do upgrades actually change outcomes? If RAPID_FIRE doesn't measurably increase kill rate, it fails the competence test. Autonomy maps to whether different build archetypes produce genuinely different play experiences.

### 1.4 Interaction Density & Pacing

Game density research establishes that engagement correlates with the concentration of meaningful interactions per unit time. Different genres have different optimal densities:

- **High-density genres** (shmups, bullet-hell): Constant decision-making, reflexive responses
- **Low-density genres** (exploration, puzzle): Deliberate pacing, reflection periods

**For Rainboids (bullet-hell shooter)**, optimal engagement requires:
- High moment-to-moment decision density during combat
- Brief respite periods between waves (not too long — kills momentum)
- Escalating density as waves progress (more threats = more decisions)
- No "dead zones" — periods where nothing threatens the player

**Measurable as:** Events per second (kills, dodges, damage events, near-misses), with target ranges per wave tier.

### 1.5 Difficulty Curve Research

Research on procedural game difficulty (Politowski et al., 2023; Khalifa et al., 2018) shows:

- **Ideal difficulty oscillates**, not just climbs — hard-easy-harder-easy-hardest
- **Player engagement peaks** when difficulty is ~10-15% above current player capability
- **Difficulty spikes cause churn** faster than gradual difficulty increases
- **Dynamic Difficulty Adjustment** works best when invisible to the player
- **Time to Kill (TTK)** is a core metric for action game pacing — if enemies die too fast, combat feels trivial; too slow, it feels grindy

**Measurable as:** Per-wave metrics (clear time, deaths, damage ratios) compared against expected difficulty curves.

### 1.6 Near-Miss / Close Call Theory

Excitement in action games correlates strongly with near-miss frequency — moments where the player almost dies but survives through skill or luck. These create:

- **Adrenaline spikes** — the most memorable moments
- **Perceived competence** — "I survived *that*"
- **Narrative tension** — the game feels dramatic

**Measurable as:** Frequency of damage events where health drops below thresholds (25%, 10%), bullet proximity without contact, rapid successive dodges.

### 1.7 Synthesis: The Six Dimensions of Fun

Distilling the research into six measurable dimensions applicable to Rainboids:

| # | Dimension | Source Theory | Core Question |
|---|-----------|--------------|---------------|
| 1 | **Engagement** | Flow, Interaction Density | Is the player always actively deciding? |
| 2 | **Challenge Balance** | Flow, GameFlow, DDA Research | Is difficulty appropriate — not too easy, not too hard? |
| 3 | **Competence Growth** | PENS, GameFlow Skills | Does the player feel increasingly effective? |
| 4 | **Choice Depth** | PENS Autonomy | Do decisions matter? Are there meaningful alternatives? |
| 5 | **Pacing** | Difficulty Curve, Interaction Density | Does intensity oscillate well between tension and relief? |
| 6 | **Excitement** | Near-Miss Theory, Game Refinement | Are there dramatic close-call moments? |

---

## 2. From Theory to Telemetry: Measurable Proxies

The core challenge: translating subjective experience into objective signals. Each dimension maps to specific telemetry events the bot can collect.

### 2.1 Engagement Proxies

| Metric | Formula | What It Captures | Target Range |
|--------|---------|-----------------|--------------|
| **Action Density** | `(kills + dodges + damageEvents) / secondsInWave` | Moment-to-moment activity | 1.5-4.0 events/s |
| **Threat Saturation** | `(enemies + enemyBullets + asteroids) / screenArea` | How "full" the combat space feels | 0.003-0.015 entities/1000px² |
| **Input Activity** | `inputChanges / secondsInWave` | How frequently player changes inputs | 4-12 changes/s |
| **Idle Ratio** | `secondsWithNoThreatsNearby / totalSeconds` | Dead time with nothing to do | < 0.15 (< 15%) |
| **Engagement Dips** | Count of 3s+ windows with action density < 0.5 | Boring stretches | 0 per wave (ideal) |

**Interpretation:** Low action density = boredom (enemies too few, too passive, too far away). Very high density = chaos (can't parse threats). The target range creates a "flow channel."

### 2.2 Challenge Balance Proxies

| Metric | Formula | What It Captures | Target Range |
|--------|---------|-----------------|--------------|
| **Wave Clear Time** | `waveEndTime - waveStartTime` | How long each wave takes | 15-45s (scale with wave#) |
| **Death Rate** | `deaths / wavesCleared` | How often the player dies | 0.05-0.15 per wave |
| **Damage Ratio** | `damageDealt / damageTaken` | Offensive vs defensive balance | 3:1 to 8:1 |
| **Health Floor** | `min(healthDuringWave) / maxHealth` | Lowest health reached | 0.15-0.50 |
| **TTK (Time to Kill)** | `avgTimeToKillEnemy` (per type) | How long individual enemies take | Type-dependent targets |
| **Overkill Index** | `excessDamageOnKillingBlow / enemyMaxHealth` | Are enemies dying in one shot? | < 0.3 (< 30% waste) |

**Interpretation:** Death rate too high = frustration. Damage ratio too high = trivially easy. Overkill index > 0.5 means enemies are melting instantly (no engagement in the kill). Health floor near 0 frequently = exciting close calls; always at 100% = no tension.

### 2.3 Competence Growth Proxies

| Metric | Formula | What It Captures | Target Range |
|--------|---------|-----------------|--------------|
| **Accuracy Trend** | `hitsOnEnemies / totalBulletsFired` (per wave window) | Improving aim over time | Positive slope |
| **Dodge Success Rate** | `threatsAvoided / totalThreatsInProximity` | Getting better at dodging | Positive slope |
| **Kill Efficiency** | `kills / bulletsExpended` (per wave window) | More lethal per bullet | Positive slope |
| **Upgrade Impact** | `metricDelta(pre-upgrade vs post-upgrade)` | Does buying an upgrade measurably change performance? | Statistically significant |
| **Wave Clear Time Trend** | `clearTime[wave N] / expectedClearTime[N]` | Clearing waves faster relative to expected | Near 1.0, slightly improving |

**Interpretation:** Flat or negative competence trends mean upgrades aren't impactful or the player isn't improving — both are anti-fun. Upgrade impact specifically answers: "Did buying RAPID_FIRE actually increase kill rate?" If not, the upgrade is poorly balanced.

### 2.4 Choice Depth Proxies

| Metric | Formula | What It Captures | Target Range |
|--------|---------|-----------------|--------------|
| **Build Divergence** | `shannonEntropy(upgradeDistribution)` across sessions | Are different builds viable? | High entropy = good |
| **Weapon Usage Spread** | `shannonEntropy(weaponUsageTime)` per session | Does the player use multiple weapons? | > 1.0 bits |
| **Dominant Strategy Index** | `bestArchetypeWinRate / avgArchetypeWinRate` | Is one build vastly superior? | < 1.3 (no more than 30% better) |
| **Shop Decision Time** | `timeInShop / purchasesMade` | Is shopping deliberative or mechanical? | 2-8s per purchase |
| **Upgrade Pick Rate Variance** | `coefficient of variation(upgradePickRates)` across sessions | Are some upgrades always/never bought? | < 0.8 (moderate spread) |

**Interpretation:** If one build archetype consistently reaches 40% more waves, there's a dominant strategy problem. If shop time is < 1s per purchase, decisions are automatic (no real choice). Shannon entropy measures whether choices are distributed (high = many viable options) or concentrated (low = one obvious pick).

### 2.5 Pacing Proxies

| Metric | Formula | What It Captures | Target Range |
|--------|---------|-----------------|--------------|
| **Intensity Curve** | `actionDensity[t]` plotted over session time | Shape of engagement over time | Oscillating, trending upward |
| **Wave Transition Gaps** | `timeBetweenWaves` | Breathing room between waves | 3-8s (not too long) |
| **Intensity Variance** | `stddev(actionDensity) / mean(actionDensity)` per wave | How much intensity varies within a wave | 0.3-0.7 (some variation, not chaotic) |
| **Monotony Score** | Count of 3+ consecutive waves with similar action density (< 10% change) | Flat stretches where nothing changes | 0 (ideal) |
| **Crescendo Index** | `max(actionDensity) / mean(actionDensity)` per wave | Do waves build to a climax? | 1.5-2.5 (peaks exist but aren't absurd) |

**Interpretation:** Good pacing oscillates between tension and relief. A monotony score > 0 means consecutive waves feel identical. Crescendo index measures whether waves have dramatic peaks — do they build, or stay flat?

### 2.6 Excitement Proxies

| Metric | Formula | What It Captures | Target Range |
|--------|---------|-----------------|--------------|
| **Near-Miss Frequency** | `enemyBullets passing within 30px without hit` / second | Close calls | 0.3-1.5 per second |
| **Health Crisis Events** | `count(health < 25% maxHealth)` per wave | Dramatic survival moments | 0.5-2.0 per wave |
| **Clutch Kills** | Kills scored while health < 25% | Heroic last-stand moments | > 0 in late waves |
| **Multi-Kill Bursts** | `count(3+ kills within 2s)` per wave | Satisfying burst moments | Increasing with wave |
| **Survival Recoveries** | `count(health drops below 25% then recovers above 60%)` | Comebacks | > 0 per session |
| **Velocity Variance** | `stddev(playerSpeed)` per wave | Movement dynamism (juking, dodging, circling) | High = exciting |

**Interpretation:** A game with zero near-misses feels safe and boring. Too many health crises = frustrating. Clutch kills and survival recoveries are the most memorable moments — their presence indicates exciting gameplay.

---

## 3. Current QA Bot Capabilities

### What Already Exists (tools/ai-qa-bot/)

The bot has a solid foundation. Here's what's already captured and what's missing:

| Layer | Current State | Relevant to Fun? |
|-------|--------------|-------------------|
| **State snapshots** (10Hz) | Player position, health, entities, wave | Yes — foundation for all metrics |
| **Delta events** | wave_start, damage_taken, death, enemy_killed, money_earned/spent | Yes — core event stream |
| **Performance metrics** (1Hz) | FPS, entity counts per type | Partial — entity counts useful for threat saturation |
| **Bug detection** | 13 invariant checks | No — correctness, not fun |
| **Session counters** | Kills, deaths, money, purchases, waves reached | Yes — summary stats, but no per-wave granularity |
| **Combat AI** | Threat detection, dodge logic, aiming, skill usage | Yes — dodge success can be instrumented |
| **Shop AI** | 5 build archetypes, 4 purchase strategies | Yes — build diversity enables choice depth testing |
| **Reports** | Bug report, balance report, LLM analysis prompt | Partial — balance report is close but doesn't score fun |

### What's Missing

1. **Per-wave bucketing** — All metrics are session-level. Need per-wave breakdowns to see pacing and difficulty curves.
2. **Near-miss / proximity tracking** — No tracking of bullet proximity, close calls, or threat avoidance.
3. **Action density calculation** — Events exist but aren't aggregated into density metrics.
4. **Competence trends** — No tracking of accuracy, dodge rate, or efficiency over time.
5. **Composite scoring** — No fun score, no engagement score, no pacing score.
6. **Comparative analysis** — No way to compare two game versions and say "version A is 12% more fun."
7. **Wave-level intensity profiling** — No intensity curves, no monotony detection, no crescendo measurement.
8. **Dodge instrumentation** — Combat AI dodges threats but doesn't track success/failure of dodges.

---

## 4. The Fun Metrics Framework

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     QA Bot Tick Loop                     │
│                                                         │
│   StateReader ──→ FunMetricsCollector ──→ SessionLogger  │
│       ↓                   ↓                    ↓        │
│   CombatAI ──→    ProximityTracker            events    │
│       ↓                   ↓                    ↓        │
│   Driver ──→       WaveBucket              FunAnalyzer  │
│                       ↓                        ↓        │
│               EngagementScorer          FunReportGen     │
│               ChallengeScorer                  ↓        │
│               CompetenceScorer          fun-report.md    │
│               ChoiceScorer              fun-report.json  │
│               PacingScorer              fun-score.json   │
│               ExcitementScorer                          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 New Module: `analysis/fun-metrics-collector.js`

Runs alongside the existing state reader at each tick. Collects raw signals needed for fun scoring.

**Per-tick collection:**
```javascript
class FunMetricsCollector {
    constructor() {
        this.waveBuckets = new Map();  // wave# → WaveBucket
        this.currentWave = null;
        this.proximityTracker = new ProximityTracker();
    }

    // Called every tick with current state + events
    tick(state, events, botInputs) {
        const bucket = this._getOrCreateBucket(state.wave);

        // 1. Track action density
        bucket.addActionEvents(events);  // kills, damage, dodges

        // 2. Track threat proximity
        this.proximityTracker.update(state.player, state.entities);
        bucket.nearMisses += this.proximityTracker.getNearMissCount();

        // 3. Track input activity
        bucket.inputChanges += this._countInputChanges(botInputs);

        // 4. Track health trajectory
        bucket.healthSamples.push(state.player.health / state.player.maxHealth);

        // 5. Track entity counts for threat saturation
        bucket.entitySamples.push({
            enemies: state.entities.enemies.length,
            bullets: state.entities.enemyBullets.length,
            asteroids: state.entities.asteroids.length,
        });

        // 6. Track player velocity for movement dynamism
        const speed = Math.hypot(state.player.vx, state.player.vy);
        bucket.velocitySamples.push(speed);
    }
}
```

### 4.3 New Module: `analysis/proximity-tracker.js`

Tracks near-misses and dodge events by monitoring bullet trajectories relative to the player.

```javascript
class ProximityTracker {
    constructor(nearMissRadius = 30, dangerRadius = 80) {
        this.nearMissRadius = nearMissRadius;
        this.dangerRadius = dangerRadius;
        this._prevBulletPositions = new Map();
        this._nearMissCount = 0;
        this._dodgeAttempts = 0;
        this._dodgeSuccesses = 0;
    }

    update(player, entities) {
        this._nearMissCount = 0;

        for (const bullet of entities.enemyBullets) {
            const dist = Math.hypot(bullet.x - player.x, bullet.y - player.y);

            // Near-miss: bullet passes within nearMissRadius without hitting
            const prevPos = this._prevBulletPositions.get(bulletKey(bullet));
            if (prevPos) {
                const prevDist = Math.hypot(prevPos.x - player.x, prevPos.y - player.y);
                // Bullet was approaching and is now receding, closest point was within threshold
                if (prevDist < dist && prevDist < this.nearMissRadius && prevDist > player.radius) {
                    this._nearMissCount++;
                }
            }

            // Track for next frame
            this._prevBulletPositions.set(bulletKey(bullet), { x: bullet.x, y: bullet.y });
        }

        // Clean up bullets that no longer exist
        // ... prune stale entries
    }
}
```

### 4.4 New Module: `analysis/wave-bucket.js`

Accumulates per-wave statistics. Finalized when a wave ends.

```javascript
class WaveBucket {
    constructor(waveNumber) {
        this.wave = waveNumber;
        this.startTime = Date.now();
        this.endTime = null;

        // Action density
        this.kills = 0;
        this.damageEventsDealt = 0;
        this.damageEventsTaken = 0;
        this.dodgeEvents = 0;
        this.deaths = 0;

        // Near-miss / excitement
        this.nearMisses = 0;
        this.healthCrises = 0;       // health < 25%
        this.clutchKills = 0;        // kills while health < 25%
        this.multiKillBursts = 0;    // 3+ kills in 2s
        this.survivalRecoveries = 0; // health < 25% → > 60%

        // Threat saturation
        this.entitySamples = [];     // [{enemies, bullets, asteroids}]

        // Health tracking
        this.healthSamples = [];     // [0.0-1.0]
        this.healthFloor = 1.0;      // Lowest health ratio

        // Input activity
        this.inputChanges = 0;

        // Movement
        this.velocitySamples = [];

        // Competence
        this.bulletsFired = 0;
        this.bulletsHit = 0;
        this.killTimes = [];         // ms from enemy spawn to death

        // Timing
        this.actionEvents = [];      // [{ts, type}] for density calculation
    }

    finalize() {
        this.endTime = Date.now();
        this.durationMs = this.endTime - this.startTime;
        this.durationS = this.durationMs / 1000;

        // Compute derived metrics
        this.actionDensity = this.actionEvents.length / Math.max(1, this.durationS);
        this.idleRatio = this._computeIdleRatio();
        this.threatSaturation = this._avgThreatSaturation();
        this.inputRate = this.inputChanges / Math.max(1, this.durationS);
        this.healthFloor = Math.min(...this.healthSamples, 1.0);
        this.velocityVariance = stddev(this.velocitySamples);
        this.damageRatio = this.damageEventsDealt / Math.max(1, this.damageEventsTaken);
        this.accuracy = this.bulletsHit / Math.max(1, this.bulletsFired);

        // Intensity curve within wave (split into 4 quarters)
        this.intensityCurve = this._computeIntensityCurve();
    }
}
```

### 4.5 New Module: `analysis/fun-analyzer.js`

Consumes finalized wave buckets and produces dimension scores.

**Six scoring functions**, one per dimension. Each returns a 0-100 score.

```javascript
class FunAnalyzer {
    constructor(waveBuckets) {
        this.buckets = waveBuckets;  // Map<waveNumber, WaveBucket>
    }

    analyze() {
        return {
            engagement: this.scoreEngagement(),
            challengeBalance: this.scoreChallengeBalance(),
            competenceGrowth: this.scoreCompetenceGrowth(),
            choiceDepth: null, // Computed across sessions, not within one
            pacing: this.scorePacing(),
            excitement: this.scoreExcitement(),
            overall: null,  // Computed from above
        };
    }
}
```

#### Engagement Scoring (0-100)

```javascript
scoreEngagement() {
    let score = 100;
    const waves = [...this.buckets.values()];

    for (const w of waves) {
        // Penalize low action density (boredom)
        if (w.actionDensity < 1.5) score -= 5 * (1.5 - w.actionDensity);
        // Penalize excessive action density (chaos/unreadable)
        if (w.actionDensity > 4.0) score -= 3 * (w.actionDensity - 4.0);
        // Penalize high idle ratio
        if (w.idleRatio > 0.15) score -= 10 * (w.idleRatio - 0.15);
        // Penalize low threat saturation (empty-feeling)
        if (w.threatSaturation < 0.003) score -= 5;
    }

    // Penalize engagement dips (3s+ windows of < 0.5 action density)
    const dips = waves.filter(w => w.actionDensity < 0.5).length;
    score -= dips * 8;

    return Math.max(0, Math.min(100, score));
}
```

#### Challenge Balance Scoring (0-100)

```javascript
scoreChallengeBalance() {
    let score = 100;
    const waves = [...this.buckets.values()];

    for (const w of waves) {
        // Penalize death rate outside target (0.05-0.15 per wave)
        const deathRate = w.deaths; // 0 or 1 for a single wave
        // High death count in one wave = spike
        if (deathRate > 1) score -= 10 * (deathRate - 1);

        // Penalize extreme damage ratios
        if (w.damageRatio > 10) score -= 3; // Too easy
        if (w.damageRatio < 2) score -= 5;  // Too hard

        // Penalize very low health floors consistently (frustration)
        if (w.healthFloor < 0.1 && w.deaths > 0) score -= 5;

        // Penalize wave clear times outside target range
        const targetMin = 15 + w.wave * 0.5;
        const targetMax = 45 + w.wave * 1.0;
        if (w.durationS < targetMin * 0.5) score -= 3; // Too fast
        if (w.durationS > targetMax * 1.5) score -= 5; // Too slow
    }

    // Penalize difficulty spikes (consecutive waves where death rate jumps > 3x)
    for (let i = 1; i < waves.length; i++) {
        const prevDR = waves[i-1].damageEventsTaken || 1;
        const curDR = waves[i].damageEventsTaken || 1;
        if (curDR / prevDR > 3) score -= 8; // Difficulty spike
    }

    return Math.max(0, Math.min(100, score));
}
```

#### Competence Growth Scoring (0-100)

```javascript
scoreCompetenceGrowth() {
    const waves = [...this.buckets.values()];
    if (waves.length < 5) return 50; // Not enough data

    // Compute accuracy trend (linear regression slope)
    const accuracies = waves.map(w => w.accuracy);
    const accuracySlope = linearRegressionSlope(accuracies);

    // Compute kill efficiency trend
    const efficiencies = waves.map(w => w.kills / Math.max(1, w.bulletsFired));
    const efficiencySlope = linearRegressionSlope(efficiencies);

    // Compute dodge rate trend
    const dodgeRates = waves.map(w =>
        w.dodgeEvents / Math.max(1, w.dodgeEvents + w.damageEventsTaken)
    );
    const dodgeSlope = linearRegressionSlope(dodgeRates);

    let score = 50; // Neutral baseline

    // Positive slopes = competence growing = good
    if (accuracySlope > 0) score += Math.min(20, accuracySlope * 500);
    if (efficiencySlope > 0) score += Math.min(15, efficiencySlope * 500);
    if (dodgeSlope > 0) score += Math.min(15, dodgeSlope * 500);

    // Negative slopes = regression = bad
    if (accuracySlope < 0) score -= Math.min(20, -accuracySlope * 500);
    if (efficiencySlope < 0) score -= Math.min(15, -efficiencySlope * 500);

    return Math.max(0, Math.min(100, score));
}
```

#### Pacing Scoring (0-100)

```javascript
scorePacing() {
    const waves = [...this.buckets.values()];
    if (waves.length < 3) return 50;

    let score = 100;
    const densities = waves.map(w => w.actionDensity);

    // Penalize monotony: 3+ consecutive waves with < 10% density change
    let monotoneStreak = 0;
    for (let i = 1; i < densities.length; i++) {
        const change = Math.abs(densities[i] - densities[i-1]) / Math.max(0.1, densities[i-1]);
        if (change < 0.10) {
            monotoneStreak++;
            if (monotoneStreak >= 3) score -= 8;
        } else {
            monotoneStreak = 0;
        }
    }

    // Reward oscillation: density should alternate up/down
    let oscillations = 0;
    for (let i = 2; i < densities.length; i++) {
        const d1 = densities[i-1] - densities[i-2];
        const d2 = densities[i] - densities[i-1];
        if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) oscillations++;
    }
    const oscillationRatio = oscillations / Math.max(1, densities.length - 2);
    score += (oscillationRatio - 0.3) * 30; // Reward oscillation above 30%

    // Penalize if overall density trend is flat (no escalation)
    const densitySlope = linearRegressionSlope(densities);
    if (densitySlope < 0.01) score -= 10; // Should generally trend upward

    // Check wave transition gaps aren't too long (from session events)
    // This would use wave_start/wave_end timestamps

    return Math.max(0, Math.min(100, score));
}
```

#### Excitement Scoring (0-100)

```javascript
scoreExcitement() {
    const waves = [...this.buckets.values()];
    let score = 50; // Neutral baseline

    let totalNearMisses = 0;
    let totalHealthCrises = 0;
    let totalClutchKills = 0;
    let totalMultiKills = 0;
    let totalRecoveries = 0;

    for (const w of waves) {
        totalNearMisses += w.nearMisses;
        totalHealthCrises += w.healthCrises;
        totalClutchKills += w.clutchKills;
        totalMultiKills += w.multiKillBursts;
        totalRecoveries += w.survivalRecoveries;

        // Reward movement dynamism (velocity variance)
        if (w.velocityVariance > 2.0) score += 1;
    }

    const waveCount = Math.max(1, waves.length);

    // Near-miss frequency: target 2-8 per wave
    const nmPerWave = totalNearMisses / waveCount;
    if (nmPerWave >= 2 && nmPerWave <= 8) score += 15;
    else if (nmPerWave < 1) score -= 10; // Too safe
    else if (nmPerWave > 15) score -= 5;  // Too chaotic

    // Health crises: target 0.5-2 per wave
    const hcPerWave = totalHealthCrises / waveCount;
    if (hcPerWave >= 0.5 && hcPerWave <= 2) score += 10;
    if (hcPerWave > 4) score -= 10; // Frustrating

    // Clutch kills: any is good
    if (totalClutchKills > 0) score += Math.min(15, totalClutchKills * 3);

    // Multi-kill bursts: satisfying
    if (totalMultiKills > 0) score += Math.min(10, totalMultiKills * 2);

    // Survival recoveries: dramatic
    if (totalRecoveries > 0) score += Math.min(10, totalRecoveries * 5);

    return Math.max(0, Math.min(100, score));
}
```

---

## 5. Implementation Plan

### Phase 1: Data Collection Layer (Foundation)

**Goal:** Instrument the bot to collect all raw signals needed for fun metrics.

| File | Action | Effort |
|------|--------|--------|
| `analysis/wave-bucket.js` | **New** — Per-wave stat accumulator | Medium |
| `analysis/proximity-tracker.js` | **New** — Near-miss and dodge tracking | Medium |
| `analysis/fun-metrics-collector.js` | **New** — Tick-level collection coordinator | Medium |
| `perception/state-reader.js` | **Extend** — Add player bullet count deltas for accuracy tracking | Small |
| `strategy/combat-ai.js` | **Instrument** — Track dodge attempts + successes via existing threat detection | Small |
| `core/session-logger.js` | **Extend** — Add `waveBuckets` to session JSON output | Small |
| `bot.js` | **Integrate** — Wire FunMetricsCollector into the tick loop | Small |

**Key implementation detail:** The collector hooks into the existing `readWithEvents()` call — no new page.evaluate() calls needed. It operates purely on the state snapshots and event deltas already being produced.

### Phase 2: Analysis & Scoring (Brain)

**Goal:** Compute fun dimension scores from collected data.

| File | Action | Effort |
|------|--------|--------|
| `analysis/fun-analyzer.js` | **New** — Six dimension scorers + composite score | Large |
| `analysis/fun-analyzer.js` | Include `linearRegressionSlope()`, `stddev()`, `shannonEntropy()` utility functions | Small |
| `analysis/fun-report-generator.js` | **New** — Fun-specific reports (markdown + JSON) | Medium |
| `analysis/report-generator.js` | **Extend** — Include fun scores in balance report + LLM prompt | Small |

### Phase 3: Multi-Session Comparison (Choice Depth + Optimization)

**Goal:** Compare fun scores across sessions, builds, and game versions.

| File | Action | Effort |
|------|--------|--------|
| `analysis/fun-comparator.js` | **New** — Compare fun scores between sessions/versions | Medium |
| `analysis/fun-analyzer.js` | **Extend** — Add `scoreChoiceDepth()` using cross-session data (build divergence, upgrade entropy) | Medium |
| `core/config.js` | **Extend** — Add `--fun-report` CLI flag, `--compare-fun <sessionA> <sessionB>` | Small |
| `run.js` | **Extend** — Wire new CLI flags | Small |

### Phase 4: Optimization Loop (Endgame)

**Goal:** Close the loop — the bot identifies *what to change* to maximize fun.

| File | Action | Effort |
|------|--------|--------|
| `analysis/fun-optimizer.js` | **New** — Identifies low-scoring dimensions and suggests specific parameter changes | Large |
| `analysis/fun-report-generator.js` | **Extend** — Generate LLM-consumable optimization prompts with fun data | Medium |

### File Structure After Implementation

```
tools/ai-qa-bot/
├── analysis/
│   ├── report-generator.js           (existing, extended)
│   ├── fun-metrics-collector.js      (NEW — tick-level collection)
│   ├── proximity-tracker.js          (NEW — near-miss tracking)
│   ├── wave-bucket.js                (NEW — per-wave stats)
│   ├── fun-analyzer.js               (NEW — scoring engine)
│   ├── fun-report-generator.js       (NEW — fun-specific reports)
│   ├── fun-comparator.js             (NEW — cross-session comparison)
│   └── fun-optimizer.js              (NEW — optimization suggestions)
├── ... (existing modules unchanged)
```

---

## 6. The Fun Score: Composite Index

### 6.1 Weighted Composite

Each dimension gets a weight reflecting its importance to Rainboids specifically:

| Dimension | Weight | Rationale |
|-----------|--------|-----------|
| **Engagement** | 0.25 | Core metric — if nothing's happening, nothing else matters |
| **Challenge Balance** | 0.20 | Second most important — too easy or too hard kills fun |
| **Excitement** | 0.20 | The "memorable moments" factor — what makes Rainboids *Rainboids* |
| **Pacing** | 0.15 | Wave structure and rhythm |
| **Competence Growth** | 0.12 | Upgrade satisfaction and skill improvement |
| **Choice Depth** | 0.08 | Important but lower priority for action game |

```
FunScore = 0.25·Engagement + 0.20·Challenge + 0.20·Excitement
         + 0.15·Pacing + 0.12·Competence + 0.08·Choice
```

### 6.2 Score Interpretation

| Score Range | Rating | Interpretation |
|-------------|--------|----------------|
| 85-100 | Excellent | Game is in flow state — tight, exciting, well-paced |
| 70-84 | Good | Solid experience with minor issues to address |
| 55-69 | Fair | Noticeable problems — some waves boring or frustrating |
| 40-54 | Poor | Significant fun issues — major rebalancing needed |
| 0-39 | Critical | Fundamentally unfun — core mechanics need rework |

### 6.3 Output Format

```json
{
  "funScore": {
    "overall": 72,
    "dimensions": {
      "engagement": { "score": 78, "issues": ["Waves 4-5 have low action density (0.8 events/s)"] },
      "challengeBalance": { "score": 65, "issues": ["Wave 16 difficulty spike: damage ratio drops from 6:1 to 1.5:1"] },
      "competenceGrowth": { "score": 80, "issues": [] },
      "choiceDepth": { "score": 55, "issues": ["DPS build reaches 40% more waves than Tank build"] },
      "pacing": { "score": 70, "issues": ["Waves 4-7 have monotone action density (< 10% variance)"] },
      "excitement": { "score": 82, "issues": [] }
    },
    "perWave": [
      { "wave": 1, "engagement": 85, "challenge": 70, "excitement": 60 },
      { "wave": 2, "engagement": 80, "challenge": 72, "excitement": 65 },
      ...
    ],
    "hotspots": [
      { "wave": 4, "dimension": "engagement", "score": 45, "diagnosis": "Guardian enemies have 3-8s fire cooldown, creating dead time" },
      { "wave": 16, "dimension": "challengeBalance", "score": 35, "diagnosis": "First Titan encounter — TTK 4x longer than any prior enemy" }
    ],
    "recommendations": [
      { "priority": 1, "dimension": "engagement", "suggestion": "Reduce Guardian fire cooldown from 3-8s to 2-4s", "expectedImpact": "+8 engagement score" },
      { "priority": 2, "dimension": "challengeBalance", "suggestion": "Reduce Titan health by 20% or add a vulnerability window", "expectedImpact": "+5 challenge score" }
    ]
  }
}
```

---

## 7. The Optimization Loop

### 7.1 The Feedback Cycle

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Run QA Bot  │────→│ Compute Fun  │────→│ Generate     │
│  (5 sessions,│     │ Scores       │     │ Optimization │
│   all builds)│     │              │     │ Report       │
└──────────────┘     └──────────────┘     └──────┬───────┘
       ↑                                         │
       │         ┌──────────────┐                │
       │         │ Apply        │←───────────────┘
       └─────────│ Changes      │
                 │ (manually or │
                 │  via Claude) │
                 └──────────────┘
```

### 7.2 CLI Usage

```bash
# Run 5 sessions across all builds with fun analysis
node ai-qa-bot/run.js --sessions 5 --build all --fun-report

# Compare fun scores between two game versions
node ai-qa-bot/run.js --compare-fun session-2026-03-22-A session-2026-03-22-B

# Run a single session and get detailed per-wave fun breakdown
node ai-qa-bot/run.js --duration 10 --fun-report --fun-detail waves

# Generate optimization recommendations from existing sessions
node ai-qa-bot/run.js --report --fun-optimize
```

### 7.3 LLM Integration

The fun report is designed to be consumed by Claude Code for automated tuning:

```markdown
## Fun Optimization Prompt

The following fun analysis was generated from 5 QA bot sessions of Rainboids.

### Lowest Scoring Dimensions
1. **Engagement** (score: 62) — Waves 4-7 consistently show < 1.0 action density
2. **Pacing** (score: 58) — Monotony detected: waves 4, 5, 6, 7 have < 10% density variation

### Per-Wave Hotspots
| Wave | Dimension | Score | Diagnosis |
|------|-----------|-------|-----------|
| 4 | engagement | 42 | Guardian cooldown 3-8s creates 4.2s average idle windows |
| 5 | engagement | 38 | Same Guardian issue, compounded by slow movement |
| 16 | challenge | 35 | Titan TTK = 23s (nearest comparison: Prowler at 6s) |

### Data-Driven Recommendations
1. Guardian fire cooldown: 3000-8000ms → 2000-4500ms (target: +15 engagement)
2. Guardian movement speed: 1.0 → 1.4 when solo (target: +8 engagement)
3. Titan health: 60 → 48 for first encounter (wave 16) (target: +10 challenge)

Based on this analysis, suggest specific code changes to the game configuration
files (enemy-data.js, wave-data.js) that would address these issues.
```

### 7.4 A/B Testing Protocol

To validate that changes actually improve fun:

1. **Baseline:** Run 10 sessions on current game version → compute fun scores
2. **Change:** Apply recommended modifications
3. **Retest:** Run 10 sessions on modified version → compute fun scores
4. **Compare:** `--compare-fun baseline modified` → see per-dimension deltas
5. **Accept/Reject:** If overall fun score improved and no dimension regressed > 5 points, accept the change

This creates a principled, data-driven approach to game tuning that replaces "feels right" with "measures better."

---

## 8. Research Sources

### Foundational Theory
- Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience*
- [Flow in Games — Jenova Chen MFA Thesis](https://www.jenovachen.com/flowingames/Flow_in_games_final.pdf)
- [The Flow Theory Applied to Game Design — ThinkGameDesign](https://thinkgamedesign.com/flow-theory-game-design/)
- [Flow Applied to Game Design — Game Developer](https://www.gamedeveloper.com/design/the-flow-applied-to-game-design)
- [Flow Experience in Gameful Approaches: Systematic Review](https://www.tandfonline.com/doi/full/10.1080/10447318.2025.2470279)

### GameFlow & Player Experience Models
- [GameFlow: A Model for Evaluating Player Enjoyment — Sweetser & Wyeth (2005)](https://dl.acm.org/doi/10.1145/1077246.1077253)
- [Revisiting the GameFlow Model with Detailed Heuristics](https://ojs.aut.ac.nz/journal-of-creative-technologies/article/download/16/14/)
- [GUESS: Game User Experience Satisfaction Scale — Phan et al. (2016)](https://journals.sagepub.com/doi/10.1177/0018720816669646)
- [GameFlow and Player Experience Measures](https://openresearch-repository.anu.edu.au/bitstreams/26707dba-6ca3-4c11-9f6f-8f654e62e34b/download)

### Self-Determination Theory / PENS
- [PENS — selfdeterminationtheory.org](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/)
- [The Motivational Pull of Video Games — Ryan, Rigby & Przybylski (2006)](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)
- [Rethinking Carrots: Measuring Motivation — Game Developer](https://www.gamedeveloper.com/design/rethinking-carrots-a-new-method-for-measuring-what-players-find-most-rewarding-and-motivating-about-your-game)

### Automated Playtesting & Difficulty
- [Predicting Game Difficulty and Engagement Using AI Players — ACM](https://dl.acm.org/doi/abs/10.1145/3474658)
- [Automated Playtesting With Procedural Personas — Holmgård et al.](https://www.semanticscholar.org/paper/Automated-Playtesting-With-Procedural-Personas-MCTS-Holmgård-Green/dd6f2e8edfb2c89cc602278ec4a73b0110b879b5)
- [Comprehensive Model of Automated Difficulty Evaluation — ACM](https://dl.acm.org/doi/10.1145/3705013)
- [Assessing Video Game Balance using Autonomous Agents — Politowski et al.](https://arxiv.org/pdf/2304.08699)
- [Programming Smart Playtesting — ACM TOSEM](https://dl.acm.org/doi/10.1145/3742473)
- [Transforming Game Difficulty Curves Using Function Composition — ACM CHI](https://dl.acm.org/doi/fullHtml/10.1145/3290605.3300781)

### Game Analytics & Telemetry
- [Gameplay Metrics in Game User Research — Ch. 14](https://cmps-people.ok.ubc.ca/bowenhui/game/readings/gameAnalyticsCh14.pdf)
- [Game Analytics: The Basics — Ch. 2](https://cmps-people.ok.ubc.ca/bowenhui/game/readings/ch2-game-metrics.pdf)
- [Telemetry-based Game Evaluation — ResearchGate](https://www.researchgate.net/publication/291087035_Telemetry-based_Game_Evaluation)
- [Computational Game Experience Analysis via Game Refinement Theory](https://www.sciencedirect.com/science/article/pii/S2772503022000378)
- [Balance and Flow Maps — GameAnalytics](https://www.gameanalytics.com/blog/balance-and-flow-maps)

### Interaction Density & Pacing
- [Interaction Density in Video Games — Game Developer](https://www.gamedeveloper.com/game-platforms/interaction-density-in-video-games-)
- [Interaction Density 2.0 — Game Developer](https://www.gamedeveloper.com/business/interaction-density-2-0)
- [Pacing — The Level Design Book](https://book.leveldesignbook.com/process/preproduction/pacing)
- [Boghog's Bullet Hell Shmup 101 — Shmups Wiki](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)

### Shmup & Bullet Hell Design
- [7 Twin-Stick Shooters Developers Should Study — Game Developer](https://www.gamedeveloper.com/design/7-twin-stick-shooters-that-game-developers-should-study)
- [The Anatomy of a Shmup — Game Developer](https://www.gamedeveloper.com/design/the-anatomy-of-a-shmup)
- [Balancing a Shmup — Game Developer](https://www.gamedeveloper.com/design/balancing-the-sh-out-of-our-shmup)
- [Game Balance: A Definitive Guide — GameDesignSkills](https://gamedesignskills.com/game-design/game-balance/)

### Games User Research
- [Games User Research Book](https://www.gurbook.com/)
- [Towards Democratisation of Games User Research — ACM](https://dl.acm.org/doi/10.1145/3677108)
- [Games User Research: What's Different? — NNG](https://www.nngroup.com/articles/game-user-research/)
- [Improving Level Design Through GUR — Methodology Comparison](https://www.academia.edu/36050730/Improving_level_design_through_game_user_research_A_comparison_of_methodologies_q)
