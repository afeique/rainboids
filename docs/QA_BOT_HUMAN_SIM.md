# QA Bot — Human Input Simulation Plan

## Problem Statement

The QA bot currently injects inputs via direct API manipulation (`window.gameEngine.inputHandler.input.*`), producing perfectly clean, instantaneous, frame-coherent inputs that no human could replicate. This means:

1. **No input noise** — aim snaps to exact coordinates with only a uniform random offset; real humans exhibit Perlin-like coherent jitter, overshoot/undershoot cycles, and micro-corrections
2. **No platform-specific behavior** — the bot always uses desktop-style absolute aim coordinates; there's no simulation of mobile touch imprecision, gamepad analog stick deadzones, or platform-specific input lag
3. **Skill level is shallow** — only 4 scalar parameters (reaction, accuracy, dodge, skills) with no model of human behavioral patterns like fatigue, panic, or learning within a session
4. **Kill tracking is broken** — the bot reports 3 kills across 30 waves, but wave progression requires clearing all enemies. The state-reader's delta-based kill detection misses kills during state transitions (see [Bug Analysis](#bug-kill-tracking))

### Why This Matters

The fun metrics system (implemented in 5.18.0) quantifies engagement, pacing, excitement, etc. — but if the bot doesn't play like a human, these metrics don't reflect real player experience. A bot that always fires optimally at frame-perfect intervals can't detect aiming frustration, skill floor issues, or platform-specific UX problems.

---

## Research: Human Input Characteristics

### Mouse (Desktop)

Human mouse movement follows well-studied patterns:

- **Fitts's Law**: Movement time = a + b × log₂(D/W + 1), where D = distance, W = target width. Larger, closer targets are acquired faster. This governs how quickly a human can re-aim between enemies.
- **Trajectory shape**: Real mouse paths are gently curved Bézier-like arcs, not straight lines. Humans exhibit S-curves and gentle parabolic corrections rather than linear interpolation.
- **Overshoot/undershoot cycles**: On precision tasks, humans overshoot the target, then oscillate inward with 2-3 micro-corrections. Each correction is ~40-60% of the previous error.
- **Speed-accuracy tradeoff**: Fast mouse movements have larger terminal error; slow, deliberate movements have smaller error but take longer. Modeled as σ ∝ speed × distance.
- **Jitter spectrum**: At rest, mouse position exhibits low-amplitude, high-frequency noise (~1-3px at 120Hz). During movement, jitter is masked by motion but reappears during deceleration.
- **Reaction time distribution**: Human visual reaction is ~150-250ms (log-normal distribution, not fixed), with occasional outliers (>400ms) from distraction or fatigue.

### Touch (Mobile)

Touch input has fundamentally different error characteristics:

- **Fat finger problem**: The fingertip contact patch is 45-57px wide, but the intended touch point is at the center. Reported position is offset ~10-15px from the user's intended target, biased downward (finger occludes the target).
- **Touch drift**: During sustained contact (e.g., holding a joystick), the finger position drifts 2-5px over 200-500ms as the user's hand muscles fatigue or shift.
- **Acquisition accuracy**: Touch targets below 10mm (~40px) have significantly higher error rates. Game UX guidelines recommend 52-56px visual targets with 64px touch areas.
- **Latency**: Touch-to-screen latency is typically 30-80ms on modern devices (vs. ~8-16ms for desktop mice). This adds to perceived input lag.
- **Multi-touch interference**: When two fingers are close (e.g., movement + aim joysticks), capacitive screens can ghost, merge, or swap touch identifiers.

### Analog Stick (Gamepad)

Gamepad sticks introduce their own noise model:

- **Radial deadzone**: Industry standard is 15% radial deadzone — stick values below 0.15 normalized magnitude are treated as zero. This prevents drift but creates a non-linear input-to-movement curve.
- **Stick drift**: Manufacturing variation causes non-zero resting values (0.02-0.10 typically). Older controllers exhibit worse drift. Simulated as low-frequency Perlin noise with amplitude 0.03-0.08.
- **Non-linear response curves**: Most games apply a quadratic or cubic response curve to stick input — small deflections produce proportionally smaller movements, enabling fine aim.
- **Axis cross-talk**: Moving the stick purely horizontally still produces small vertical values (±0.02-0.05 typical), and vice versa.
- **Angular quantization**: Cheap potentiometers have 8-10 bit resolution (~256-1024 steps), producing visible stepping at slow aim speeds.
- **Aim assist expectation**: Gamepad shooters universally provide aim assist (snap-to-target within 10-15 degrees) because analog sticks cannot match mouse precision. Rainboids plans this per SKU_deployment.md.

### Common Patterns Across All Platforms

- **Reaction time**: Log-normally distributed, not fixed. Mean ~180ms (desktop mouse), ~220ms (gamepad), ~250ms (touch). Tail extends to 500ms+ during low-attention moments.
- **Fatigue**: Aim accuracy degrades ~5-15% over 10+ minute sessions. Reaction time increases ~10-20%.
- **Panic response**: When health drops below ~25%, players exhibit erratic movement (rapid direction changes), reduced aim precision (-30%), and increased fire rate (mashing).
- **Attention cycles**: Players have ~90-second attention peaks followed by ~30-second valleys. During valleys, movement becomes more idle and aim becomes less precise.

---

## Architecture

### Input Pipeline (New)

```
CombatAI.computeInputs(state)
    ↓ (ideal, frame-perfect inputs)
InputHumanizer.humanize(inputs, platform, skillProfile)
    ↓ (noisy, delayed, platform-appropriate inputs)
RainboidsDriver.setInputs(humanizedInputs)
    ↓ (injected into game's input handler)
Game loop reads input
```

The `InputHumanizer` sits between the combat AI's "ideal" output and the driver's injection. This separation means:
- Combat AI logic stays clean and testable
- Humanization is composable and swappable
- Platform profiles are data-driven, not hard-coded
- Skill levels control the humanizer's noise parameters, not the AI's decision quality

### Platform Profiles

Each platform profile defines the noise model, input mapping, and constraints:

```javascript
const PLATFORM_PROFILES = {
    desktop: {
        name: 'Desktop (Mouse + Keyboard)',
        aimModel: 'mouse',           // Bézier trajectory, overshoot, Fitts's law
        movementModel: 'digital',    // WASD binary keys
        inputLatencyMs: { mean: 12, stddev: 4 },
        viewport: { width: 1920, height: 1080 },
        aimAssist: false,
    },
    mobile: {
        name: 'Mobile (Touch)',
        aimModel: 'touch-joystick',  // Right-zone virtual joystick
        movementModel: 'touch-joystick',  // Left-zone virtual joystick
        inputLatencyMs: { mean: 50, stddev: 15 },
        viewport: { width: 390, height: 844 },  // iPhone 14
        aimAssist: true,
        aimAssistAngle: 15,           // degrees snap
        touchDrift: { rate: 0.02, maxPx: 5 },
        fingerOffset: { x: 0, y: -12 },  // occlusion bias
    },
    gamepad: {
        name: 'Gamepad (Analog Sticks)',
        aimModel: 'analog-stick',    // Radial deadzone, non-linear curve
        movementModel: 'analog-stick',
        inputLatencyMs: { mean: 25, stddev: 8 },
        viewport: { width: 1920, height: 1080 },
        aimAssist: true,
        aimAssistAngle: 12,
        deadzone: 0.15,
        responseCurve: 'quadratic',  // x² mapping
        stickDrift: { amplitude: 0.04, frequency: 0.3 },  // Hz
    },
};
```

### Skill Profiles (Enhanced)

Replace the current 4 flat presets with richer, parameterized profiles:

```javascript
const SKILL_PROFILES = {
    novice: {
        // Reaction
        reactionMs: { mean: 350, stddev: 100 },  // Log-normal, not fixed
        // Aim
        aimAccuracy: 0.3,         // Base accuracy multiplier
        aimJitterAmplitude: 8,    // Perlin noise amplitude (px)
        aimJitterFrequency: 2.5,  // Hz — how fast aim wanders
        overshootFactor: 0.4,     // 40% overshoot on target switches
        microCorrectionSpeed: 0.3, // Slow convergence to target
        // Movement
        dodgeProb: 0.2,
        movementSmoothness: 0.3,  // Low = jerky direction changes
        wallBumpRate: 0.15,       // Probability of running into walls
        // Behavioral
        panicThreshold: 0.4,      // Health % where panic kicks in
        panicAimDegradation: 0.5, // 50% worse aim in panic
        fatigueRate: 0.002,       // Per-second accuracy degradation
        attentionCycleS: 60,      // Shorter attention span
        // Skills & shop
        useSkills: false,
        shopStrategy: 'random',
    },
    beginner: {
        reactionMs: { mean: 280, stddev: 60 },
        aimAccuracy: 0.5,
        aimJitterAmplitude: 5,
        aimJitterFrequency: 2.0,
        overshootFactor: 0.3,
        microCorrectionSpeed: 0.5,
        dodgeProb: 0.5,
        movementSmoothness: 0.5,
        wallBumpRate: 0.08,
        panicThreshold: 0.35,
        panicAimDegradation: 0.4,
        fatigueRate: 0.0015,
        attentionCycleS: 75,
        useSkills: false,
        shopStrategy: 'cheapest',
    },
    intermediate: {
        reactionMs: { mean: 200, stddev: 40 },
        aimAccuracy: 0.7,
        aimJitterAmplitude: 3,
        aimJitterFrequency: 1.5,
        overshootFactor: 0.2,
        microCorrectionSpeed: 0.7,
        dodgeProb: 0.7,
        movementSmoothness: 0.7,
        wallBumpRate: 0.03,
        panicThreshold: 0.25,
        panicAimDegradation: 0.3,
        fatigueRate: 0.001,
        attentionCycleS: 90,
        useSkills: true,
        shopStrategy: 'heuristic',
    },
    advanced: {
        reactionMs: { mean: 140, stddev: 25 },
        aimAccuracy: 0.95,
        aimJitterAmplitude: 1.5,
        aimJitterFrequency: 1.0,
        overshootFactor: 0.08,
        microCorrectionSpeed: 0.9,
        dodgeProb: 0.95,
        movementSmoothness: 0.9,
        wallBumpRate: 0.01,
        panicThreshold: 0.15,
        panicAimDegradation: 0.15,
        fatigueRate: 0.0005,
        attentionCycleS: 120,
        useSkills: true,
        shopStrategy: 'optimal',
    },
    // Custom: pass arbitrary numeric values
};
```

### Parameterizable Skill via CLI

```bash
# Preset
node tools/ai-qa-bot/run.js --skill intermediate

# Custom overrides (JSON)
node tools/ai-qa-bot/run.js --skill '{"reactionMs":{"mean":250,"stddev":50},"aimAccuracy":0.6}'

# Platform selection
node tools/ai-qa-bot/run.js --platform desktop    # default
node tools/ai-qa-bot/run.js --platform mobile
node tools/ai-qa-bot/run.js --platform gamepad
```

---

## <a name="bug-kill-tracking"></a>Bug Analysis: Kill Tracking — RESOLVED (5.18.3)

### The Problem

The QA bot reported 3 kills across 30 waves, but wave progression requires killing all enemies per wave.

### Root Cause (Multiple Issues)

**Issue 1: Delta-based detection missed kills during state transitions.** The old state-reader inferred kills by comparing enemy counts between 100ms ticks. Kills that happened during `PLAYING → WAVE_TRANSITION` transitions, or between pool cleanups and new wave spawns, were lost.

**Issue 2: Multiple kill code paths.** Investigation revealed THREE separate kill paths in `collision-system.js`, plus a fallback in `enemy.js`:
1. **Bullet-enemy collision** (`collision-system.js:380`) — calls `enemy.takeDamage()`, handles kill reward inline
2. **Power weapon `damageEnemy()`** (`collision-system.js:713`) — separate function used by nova blast, missiles, etc.
3. **Player-enemy body collision** (`collision-system.js:811`) — also calls `enemy.takeDamage()`
4. **Enemy update fallback** (`enemy.js:385`) — catches `health <= 0.001` not handled by collision

The old delta detection missed all of these during transitions. The initial fix only added the buffer to `damageEnemy()` (path 2), missing paths 1, 3, and 4.

### Fix Implemented

Added `window._qaBotKillBuffer.push({type, wave, ts})` to all four kill paths. State reader initializes the buffer on first tick and drains it via `page.evaluate()` each tick, replacing the delta-based inference entirely.

**Validation results:** Direct instrumentation confirmed pool removals = buffer kills = 100% match. The bot now correctly reports kill counts that are consistent with wave progression.

### Remaining Observation: Low Kill Counts

The bot reports 5-18 kills across 30-46 waves, while total enemies spawned is ~73-120. This is **not a tracking bug** — the bot's combat AI simply doesn't kill most enemies. Investigation revealed:
- Player bullets have ~460px range (24% of 1920px game field)
- Enemies spawn at field edges, often 600-900px from the player
- The combat AI's dodge-and-drift behavior keeps the player near center
- Most kills are from **player-enemy body collision** (ramming), not bullets
- Waves still progress because enemies eventually approach the player and die from auto-fire at close range or body collision

This is a combat AI effectiveness issue to be addressed in Phase 2-3 of the human simulation plan (InputHumanizer + Desktop Mouse Model), where the bot will actively pursue enemies with human-like movement patterns.

---

## Implementation Plan

### Phase 1: Fix Kill Tracking (Critical Bug) — COMPLETE (5.18.3)

**Files modified:**
- `js/modules/combat/collision-system.js` — added kill buffer push to all 3 kill paths (bullet collision line 408, `damageEnemy` line 722, body collision line 815)
- `js/modules/enemy/enemy.js` — added kill buffer push to `health <= 0.001` fallback death check (line 386)
- `tools/ai-qa-bot/perception/state-reader.js` — initializes `window._qaBotKillBuffer` on first tick, drains buffer each tick via `page.evaluate()`, replaced delta-based kill inference

**Validation:** Direct pool instrumentation confirmed buffer kills = pool removals = 100% match. Kill counts now correctly reflect actual kills (5-18 per session, consistent with combat AI's limited engagement range).

### Phase 2: InputHumanizer Core

**New file:** `tools/ai-qa-bot/motor/input-humanizer.js`

**Implements:**
1. **Perlin noise generator** (1D temporal) — for coherent aim jitter that evolves smoothly frame-to-frame, unlike the current `Math.random()` per-frame noise
2. **Aim trajectory planner** — when switching targets, compute a Bézier curve from current aim to new target with overshoot and settle. Track progress along curve each tick.
3. **Reaction delay** — log-normal distribution sampling instead of fixed delay. Track per-decision delay independently.
4. **Movement smoothing** — low-pass filter on WASD toggles to prevent inhuman rapid direction switching. Add momentum: once moving in a direction, resist changing for `smoothness × 100ms`.
5. **Fatigue model** — degrade aimAccuracy and increase reactionMs by `fatigueRate` per second of session elapsed.
6. **Panic model** — when health < `panicThreshold × maxHealth`, increase jitter amplitude, reduce dodge probability, and add erratic movement bursts.

**Integration:**
- `bot.js` creates `InputHumanizer(platform, skillProfile)` in constructor
- `_tick()` calls `combatAI.computeInputs(state)` then `humanizer.humanize(inputs)` then `driver.setInputs(result)`

### Phase 3: Desktop Mouse Model

**Extends InputHumanizer with:**
1. **Aim trajectory** — Bézier interpolation from current aim to target:
   - Control point 1: 30% along straight line, offset perpendicular by `overshootFactor × distance × random(0.5, 1.5)`
   - Control point 2: 80% along, slight correction toward target
   - Travel time: Fitts's law derived from distance and target radius
2. **Micro-corrections** — after arriving at target vicinity, oscillate with damped sinusoidal: `error × e^(-t/τ) × sin(2πft)` where τ = `1/microCorrectionSpeed`, f ≈ 3Hz
3. **Resting jitter** — when aim is stationary, add Perlin noise at 1-2px amplitude, 4-6Hz
4. **WASD digital movement** — stays binary (on/off) but with key-press delay modeling: min 30ms between direction changes (human can't instantly reverse), occasional missed key releases (sticky keys for 1-2 frames)

### Phase 4: Mobile Touch Model (Stub)

Since the game doesn't yet have dual-stick mobile controls, this phase creates the infrastructure that will be functional once mobile controls are implemented.

**New file:** `tools/ai-qa-bot/motor/touch-simulator.js`

**Implements (as stubs with TODO markers):**
1. **Dual joystick zones** — left 45% for movement, right 55% for aim (matches SKU_deployment.md plan)
2. **Touch coordinate injection** — currently non-functional since the game only processes the left movement joystick. Stubs for:
   - `simulateJoystickTouch(zone, angle, magnitude)` — converts to screen coordinates and injects touch events
   - `simulateTap(x, y)` — for skill buttons and shop interaction
3. **Touch noise model** (implemented but inactive):
   - Fat finger offset: Gaussian(0, 8px) on both axes, -12px Y bias
   - Touch drift: 0.02px/frame drift in random walk, clamped to 5px max
   - Touch-up inaccuracy: release position offset from hold position by 3-8px
4. **Viewport scaling** — test at mobile resolutions (390×844 iPhone, 412×915 Pixel, 360×780 budget Android)
5. **Input latency injection** — add 30-80ms (configurable) delay to all touch inputs

**Status:** Stubs will log warnings when used: `"Mobile touch simulation: game does not yet support dual-stick controls. Movement joystick only."`

When the game implements dual-stick controls (per SKU_deployment.md Phase 1), these stubs become functional by wiring to the game's touch event handlers.

### Phase 5: Gamepad Analog Stick Model (Stub)

Since the game doesn't yet have gamepad support, this phase creates the infrastructure.

**New file:** `tools/ai-qa-bot/motor/gamepad-simulator.js`

**Implements (as stubs with TODO markers):**
1. **Analog stick state** — maintain virtual left/right stick state as `{x: float, y: float}` in [-1, 1] range
2. **Radial deadzone** — configurable (default 15%), applies before output
3. **Response curves** — `linear`, `quadratic` (x²), `cubic` (x³) — controls how stick deflection maps to aim/move speed
4. **Stick drift noise** — low-frequency Perlin noise (0.3Hz) with amplitude 0.03-0.08, simulating worn potentiometers
5. **Axis cross-talk** — add ±0.02-0.05 to perpendicular axis during single-axis movement
6. **Trigger input** — binary threshold at 0.5 for fire/secondary fire
7. **Button press timing** — 40-80ms press duration for face buttons (skills)

**Integration path:** When the game adds `GamepadHandler` (per SKU_deployment.md), the simulator will emit synthetic `gamepadconnected` events and populate `navigator.getGamepads()` return values via Playwright page context injection.

**Status:** Stubs will log warnings when used: `"Gamepad simulation: game does not yet support gamepad input. Desktop keyboard/mouse fallback."`

### Phase 6: Enhanced Skill Profiles

**Modified file:** `tools/ai-qa-bot/core/config.js`

1. Replace flat `SKILL_PRESETS` with rich `SKILL_PROFILES` (see Architecture section above)
2. Add CLI parsing for JSON skill overrides
3. Add `--platform` CLI flag to `run.js`
4. Add intra-session learning: `learningRate` parameter that gradually improves accuracy and reaction time within a single session (simulates a player warming up)
5. Add attention cycle model: sinusoidal accuracy modulation with period = `attentionCycleS`

### Phase 7: Combat AI Overhaul

**Modified file:** `tools/ai-qa-bot/strategy/combat-ai.js`

**Implements:**
1. **Context steering** — replace simple approach/flee with 16-direction interest/danger maps. Interest sources: target enemy, weapon-range sweet spot, circle-strafe tangent. Danger sources: enemy bullets (velocity obstacle projection), enemy proximity, arena boundaries.
2. **Predictive aiming** — quadratic intercept calculation for lead aiming. `leadFactor` parameter controls prediction quality (0 = aim at current pos, 1 = perfect intercept).
3. **Target prioritization** — weighted composite score: threat × distance × health × angle. Replace "aim at nearest" with intelligent target selection. Configurable switching cooldown and threshold.
4. **Weapon-specific engagement** — per-weapon ideal range, aim style (tracking vs snapshot), and burst pattern. Combat AI adjusts approach distance and fire behavior by equipped weapon.
5. **Bullet dodging** — velocity obstacle method: project incoming bullet paths, add danger in approach direction, steer perpendicular to bullet travel. `bulletAwareness` controls how many bullets the AI tracks.

**All parameters exposed as skill-level tunables** (see `COMBAT_SKILL_PROFILES` in Research section).

### Phase 8: Shop Decision-Making

**New file:** `tools/ai-qa-bot/strategy/shop-ai.js`

**Implements:**
1. **Session telemetry tracker** — accumulate per-wave stats: avgHealthRatio, avgKillTime, hitAccuracy, damageSourceBreakdown, bulletDodgeRate, engagementRange. Rolling window of last N waves (configurable).
2. **Utility-based need scoring** — each upgrade gets a need score (0-1) computed from telemetry. LONG_RANGE scores high when engagement range exceeds weapon range; HEALTH_BOOST scores high when avgHealthRatio is low; etc.
3. **Value scoring** — needScore / cost, with build archetype bias (1.3× for matching upgrades).
4. **Adaptive build strategy** — re-evaluate build archetype every 5 waves based on damageStress, dpsStress, mobilityStress. Shift from BALANCED to TANK/GLASS_CANNON/SPEED_DEMON as session data dictates.
5. **Saving logic** — skip purchases when best available need score is low, or when close to affording a high-value upgrade.
6. **Skill-level noise** — novice applies random(0.5, 1.5) multiplier to scores; advanced uses raw scores with no noise.

**Modified file:** `tools/ai-qa-bot/bot.js` — wire shop-ai into shop decision event, pass session telemetry.

**Modified file:** `tools/ai-qa-bot/perception/state-reader.js` — track additional telemetry fields (hit accuracy, damage sources, engagement range).

### Phase 9: Validation & Calibration

**How to verify the humanizer produces realistic input:**

1. **Kill rate calibration**: Run 5 sessions at each skill level. Expected kill rates:
   - Novice: ~30-50% of enemies (many whiffed shots, slow reactions)
   - Beginner: ~50-70%
   - Intermediate: ~70-90%
   - Advanced: ~90-98%
   - Verify the bot's actual kill rate falls in these ranges

2. **Aim heatmap**: Log all `aimX/aimY` values and overlay on game field. Human-like patterns should show:
   - Clustering around enemy positions (with spread)
   - Smooth trajectory arcs between targets
   - No perfectly straight lines or instant jumps

3. **Input frequency analysis**: FFT of aim coordinate time series. Human input should show:
   - Low-frequency peak at 1-3Hz (deliberate aiming)
   - Noise floor rising at 5-10Hz (jitter)
   - No energy above 15Hz (physically impossible)

4. **Platform comparison**: Same skill level, same waves — compare metrics across desktop/mobile/gamepad:
   - Desktop should have highest accuracy, fastest reactions
   - Mobile should show more aim errors, longer reaction times
   - Gamepad should show smooth but less precise aim trajectories

5. **Fun score comparison**: The humanizer should change fun metrics meaningfully:
   - Novice players should find early waves more challenging (higher excitement from near-misses)
   - Advanced players should breeze through early waves (lower engagement from low challenge)
   - If fun scores don't vary by skill level, the humanizer isn't producing realistic difficulty curves

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `tools/ai-qa-bot/motor/input-humanizer.js` | Create | Core humanization pipeline: Perlin noise, trajectory planning, reaction delay, fatigue, panic |
| `tools/ai-qa-bot/motor/touch-simulator.js` | Create | Mobile touch input stub: dual joystick zones, touch noise, drift, viewport scaling |
| `tools/ai-qa-bot/motor/gamepad-simulator.js` | Create | Gamepad analog stick stub: deadzone, response curves, stick drift, cross-talk |
| `tools/ai-qa-bot/motor/noise.js` | Create | 1D/2D Perlin noise generator (shared utility for all humanizer components) |
| `tools/ai-qa-bot/strategy/shop-ai.js` | Create | Utility-based shop decisions: need scoring, adaptive build strategy, saving logic |
| `tools/ai-qa-bot/core/config.js` | Modify | Replace `SKILL_PRESETS` with `SKILL_PROFILES`, add platform profiles, combat skill profiles |
| `tools/ai-qa-bot/strategy/combat-ai.js` | Modify | Context steering, predictive aiming, target prioritization, weapon-specific behavior, bullet dodging |
| `tools/ai-qa-bot/bot.js` | Modify | Wire humanizer between combat AI and driver; wire shop-ai into shop events |
| `tools/ai-qa-bot/run.js` | Modify | Add `--platform` flag, JSON skill override parsing |
| `tools/ai-qa-bot/perception/state-reader.js` | Modify | Drain kill event buffer; track session telemetry (hit accuracy, damage sources, engagement range) |
| `js/modules/combat/collision-system.js` | Modify | Add kill event to `window._qaBotKillBuffer` (3 lines) |

---

## Implementation Priority

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| ~~**P0**~~ | ~~Phase 1: Fix kill tracking~~ | ~~Small~~ | ~~DONE (5.18.3)~~ |
| **P1** | Phase 7: Combat AI overhaul | Large | Fixes core effectiveness — bot currently can't kill enemies reliably |
| **P1** | Phase 2: InputHumanizer core | Medium | Foundation for all realism improvements |
| **P1** | Phase 3: Desktop mouse model | Medium | Most immediately useful (desktop is primary platform) |
| **P2** | Phase 8: Shop decision-making | Medium | Adaptive purchases based on session performance |
| **P2** | Phase 6: Enhanced skill profiles | Small | Better differentiation between player types |
| **P3** | Phase 4: Mobile touch stub | Small | Infrastructure only — game lacks controls |
| **P3** | Phase 5: Gamepad stick stub | Small | Infrastructure only — game lacks support |
| **P4** | Phase 9: Validation | Medium | Proves the system works correctly |

---

## Research: Combat AI Effectiveness

### Current Problems

The bot reports 5-18 kills across 30-46 waves, with most kills from body collision (ramming) rather than aimed fire. Investigation identified these root causes:

1. **Range gap**: Player bullets have ~460px base range (24% of the 1920px game field). Enemies spawn at field edges, 600-900px from the player. The combat AI's dodge-and-drift behavior keeps the player near center — well outside effective weapon range.

2. **No engagement pursuit**: The current combat AI has a `DANGER_RADIUS` of 180px and approaches enemies at 0.4 speed units when "safe," but it doesn't actively close distance to bring enemies into weapon range. The bot essentially waits for enemies to come to it.

3. **No lead aiming**: The bot aims at the enemy's current position, but fast enemies (WASP at 2.8 px/frame, HUNTER at 1.6) move significantly between when the bullet is fired and when it arrives. At 300px range with 8px/frame bullet speed, a WASP moves ~105px during bullet travel — a complete miss.

4. **No weapon-specific behavior**: All weapons are treated identically. RAIL_DRIVER (720px range, piercing) should encourage long-range sniping; SCATTER_GUN (short range, wide spread) should encourage close-range brawling; LANCE_BEAM (continuous) should encourage tracking aim. The bot ignores these distinctions.

5. **No target prioritization**: The bot doesn't prioritize high-threat enemies (WASP/STALKER rushing the player) over low-threat ones (GUARDIAN orbiting at distance).

### Game Mechanics Relevant to Combat AI

**Weapon Stats** (from `js/modules/combat/weapon-data.js`):

| Weapon | Fire Rate | Damage | Range | Notes |
|--------|-----------|--------|-------|-------|
| PULSE_CANNON | 400ms | 0.8 | 408px | Balanced default |
| STORM_NEEDLES | 130ms | 0.3 | 336px | Fast fire, short range |
| SCATTER_GUN | 500ms | 0.5×5 | 300px | Shotgun spread |
| RAIL_DRIVER | 1200ms | 3.0 | 720px | Pierce 99, long range |
| LANCE_BEAM | continuous | 0.15/tick | 360px | Tracking beam |

**Enemy Movement Patterns** (from `js/modules/enemy/movement.js`):

| Enemy | Speed | Pattern | Threat Model |
|-------|-------|---------|--------------|
| HUNTER | 1.6 | Pursuit → player | Closes distance, high threat |
| WASP | 2.8 | Fast zigzag rush | Fastest, hardest to hit |
| STALKER | 1.4 | Flanking approach | Attacks from blind spots |
| GUARDIAN | 1.0 | Orbit at distance | Ranged fire, stays away |
| DRIFTER | 0.8 | Random float | Low threat, unpredictable |
| PROWLER | 0.6 | Slow stalk | Stealth, surprise damage |
| WEAVER | 1.2 | Sinusoidal weave | Hard to track |
| SENTINEL | 0.9 | Stationary sniper | Doesn't move, easy to hit |
| TANGERINE | 1.0 | Group cluster | Swarm behavior |
| TITAN | 0.5 | Slow tank | High HP, low speed |

**Upgrade Costs** (from `js/modules/shop/shop-manager.js`):

| Upgrade | Cost | Max Stacks | Effect |
|---------|------|------------|--------|
| LONG_RANGE | 150 | 6 | +40% range per stack (max 1632px) |
| RAPID_FIRE | 300 | 5 | +20% fire rate per stack |
| HOMING | 750 | 3 | Bullet tracking per stack |
| PIERCING | 1200 | 3 | +1 pierce per stack |
| MULTI_SHOT | 1500 | 3 | +1 bullet per stack |
| HEALTH_BOOST | 200 | 5 | +20% max health |
| SHIELD_BOOST | 250 | 3 | +1 shield charge |
| SPEED_BOOST | 300 | 3 | +15% max speed |
| CRIT_CHANCE | 400 | 5 | +10% crit chance |
| CRIT_DAMAGE | 500 | 5 | +25% crit multiplier |

### Proposed Combat AI Improvements

#### 1. Context Steering for Movement

Replace the current simple approach/flee logic with a **context steering** system (as described in *Game AI Pro 2*). This uses two angular maps:

```
Interest Map: 16 directions, each scored 0-1 for "how much do I want to go this way?"
Danger Map:   16 directions, each scored 0-1 for "how dangerous is this direction?"
Result Map:   interest[i] × (1 - danger[i]) → highest-scoring direction wins
```

**Interest sources:**
- **Target enemy direction**: High interest toward the nearest/priority enemy, scaled by engagement range needs. If the enemy is beyond weapon range, interest peaks toward it. If within range, interest peaks at the tangent (circling).
- **Weapon range sweet spot**: For each weapon, define an ideal engagement distance. Interest pushes toward that distance — closing if too far, retreating if too close.
  - PULSE_CANNON: 250-350px (mid-range comfort)
  - STORM_NEEDLES: 150-250px (close range for DPS)
  - SCATTER_GUN: 100-200px (point-blank for full pellet hits)
  - RAIL_DRIVER: 400-600px (long range for safety)
  - LANCE_BEAM: 200-300px (tracking range)
- **Circle-strafe**: When within engagement range, add interest perpendicular to the enemy direction. This produces orbiting behavior — maintaining distance while staying mobile (harder to hit).

**Danger sources:**
- **Enemy bullets**: Each incoming bullet projects a danger cone in its travel direction. Magnitude scales with proximity and bullet speed.
- **Enemy proximity**: Enemies within `DANGER_RADIUS` (scaled by enemy threat level) add danger in their direction.
- **Arena boundaries**: Danger increases near walls to prevent cornering.
- **Enemy fire prediction**: Enemies that are about to fire (based on their fire interval) project extra danger from their aim direction.

**Skill parameterization:**
```javascript
combatAI: {
    contextSteeringResolution: 16,       // directions (lower = less precise)
    dangerSensitivity: 0.8,              // 0-1, how much danger affects decisions
    interestDecayRate: 0.3,              // how fast old interest fades
    pursuitAggression: 0.7,             // 0-1, how aggressively to close distance
    circleStrafePreference: 0.5,         // 0-1, orbiting vs direct approach
    retreatHealthThreshold: 0.3,         // health % below which to prioritize fleeing
}
```

Skill level maps:
- **Novice**: Low `dangerSensitivity` (0.3), low `pursuitAggression` (0.2), no circle-strafe — wanders aimlessly, doesn't dodge well, doesn't chase enemies
- **Advanced**: High `dangerSensitivity` (0.95), high `pursuitAggression` (0.8), strong circle-strafe (0.7) — actively closes to optimal range, dodges bullets, maintains orbiting pressure

#### 2. Predictive (Lead) Aiming

Instead of aiming at the enemy's current position, compute the **intercept point** — where the enemy will be when the bullet arrives.

**Algorithm**: Given enemy position `E`, enemy velocity `Ve`, player position `P`, and bullet speed `Vb`:

```
D = E - P                    // displacement vector
a = |Ve|² - Vb²             // quadratic coefficient
b = 2 × (D · Ve)            // linear coefficient
c = |D|²                    // constant

t = (-b - √(b² - 4ac)) / 2a   // time to intercept (smaller positive root)

aimPoint = E + Ve × t         // where the enemy will be at intercept
```

If the discriminant is negative (no solution — enemy is outrunning the bullet), fall back to aiming at current position.

**Skill parameterization:**
```javascript
aimPrediction: {
    leadFactor: 0.8,          // 0-1, how much lead to apply (1 = perfect prediction)
    predictionNoise: 0.1,     // adds error to estimated enemy velocity
    maxLeadFrames: 30,        // cap on prediction horizon (prevents wild shots)
}
```

- **Novice**: `leadFactor: 0.0` — aims at current position (no prediction)
- **Beginner**: `leadFactor: 0.3` — slight lead, often undershoots
- **Intermediate**: `leadFactor: 0.7` — good lead, occasional misses on fast enemies
- **Advanced**: `leadFactor: 0.95` — near-perfect lead with minimal prediction noise

#### 3. Target Prioritization

Replace "aim at nearest enemy" with a **weighted composite score**:

```
score(enemy) = w_threat × threatScore(enemy)
             + w_distance × distanceScore(enemy)
             + w_health × healthScore(enemy)
             + w_reward × rewardScore(enemy)
             + w_angle × angleScore(enemy)
```

Where:
- `threatScore`: Based on enemy type danger ranking and proximity. WASP/STALKER rushing the player score highest. Enemies currently firing at the player get a 1.5× multiplier.
- `distanceScore`: Inverse distance, weighted by whether the enemy is within weapon range (in-range enemies score 2× higher).
- `healthScore`: Lower health = higher score (finish off wounded enemies for quick kills).
- `healthScore`: Lower health = higher score (finish off wounded enemies).
- `rewardScore`: Higher coin/XP value enemies score slightly higher.
- `angleScore`: Enemies closer to the current aim direction score higher (less aim movement needed, faster engagement).

**Skill parameterization:**
```javascript
targeting: {
    targetSwitchCooldown: 500,    // ms — minimum time before switching targets
    targetSwitchThreshold: 1.5,   // new target must score 1.5× higher to switch
    threatAwareness: 0.7,         // 0-1, weight of threat in scoring
    opportunism: 0.5,             // 0-1, weight of low-health/reward targets
}
```

- **Novice**: Slow target switching (2000ms cooldown), low threat awareness (0.2) — fixates on one enemy, ignores flanking threats
- **Advanced**: Fast switching (300ms), high threat awareness (0.9) — rapidly re-prioritizes based on danger, finishes wounded enemies

#### 4. Weapon-Specific Combat Behavior

Define engagement profiles per weapon class:

```javascript
const WEAPON_ENGAGEMENT = {
    PULSE_CANNON: {
        idealRange: { min: 200, max: 380 },
        aimStyle: 'tracking',        // smooth aim following
        burstPattern: 'steady',      // fire continuously
    },
    STORM_NEEDLES: {
        idealRange: { min: 100, max: 280 },
        aimStyle: 'tracking',
        burstPattern: 'continuous',  // spray at close range
    },
    SCATTER_GUN: {
        idealRange: { min: 50, max: 200 },
        aimStyle: 'snapshot',        // quick flick-aim then fire
        burstPattern: 'burst',       // fire in bursts, reposition between
    },
    RAIL_DRIVER: {
        idealRange: { min: 350, max: 650 },
        aimStyle: 'snapshot',        // careful aim, single shot
        burstPattern: 'deliberate',  // wait for clean shot
    },
    LANCE_BEAM: {
        idealRange: { min: 150, max: 320 },
        aimStyle: 'tracking',        // hold on target
        burstPattern: 'continuous',
    },
};
```

The combat AI adjusts movement (approach/retreat to ideal range) and aim behavior (tracking vs. snapshot) based on the currently equipped weapon.

#### 5. Bullet Dodging (Velocity Obstacle Method)

For each incoming enemy bullet, compute a **velocity obstacle** — the set of player velocities that would result in collision:

```
For each bullet b:
    relPos = b.position - player.position
    relVel = b.velocity - player.velocity
    timeToClosest = -(relPos · relVel) / |relVel|²
    if timeToClosest > 0:
        closestDist = |relPos + relVel × timeToClosest|
        if closestDist < player.radius + b.radius + margin:
            // This bullet is a threat — add danger in its approach direction
            dodgeDir = perpendicular to relVel (away from bullet path)
```

This integrates into the context steering danger map — bullets approaching the player add danger in their travel direction, and the steering system naturally moves perpendicular to bullet paths.

**Skill parameterization:**
```javascript
dodging: {
    bulletAwareness: 0.7,         // 0-1, how many bullets the AI "sees"
    dodgeReactionMs: 200,         // delay before dodge begins
    dodgeCommitment: 0.6,         // 0-1, how hard it dodges (vs holding position)
    preemptiveDodge: false,       // anticipate enemy fire timing
}
```

- **Novice**: `bulletAwareness: 0.2`, `dodgeReactionMs: 500` — ignores most bullets, slow to react
- **Advanced**: `bulletAwareness: 0.95`, `dodgeReactionMs: 100`, `preemptiveDodge: true` — sees nearly all threats, dodges preemptively based on enemy fire intervals

### Integrated Combat Skill Profiles

Combining the humanizer parameters (Phase 2-3) with the combat AI parameters above:

```javascript
const COMBAT_SKILL_PROFILES = {
    novice: {
        // ... existing humanizer params from SKILL_PROFILES ...
        combat: {
            pursuitAggression: 0.2,
            circleStrafePreference: 0.0,
            dangerSensitivity: 0.3,
            leadFactor: 0.0,
            predictionNoise: 0.5,
            threatAwareness: 0.2,
            opportunism: 0.2,
            targetSwitchCooldown: 2000,
            bulletAwareness: 0.2,
            dodgeReactionMs: 500,
            dodgeCommitment: 0.3,
            preemptiveDodge: false,
            weaponAdaptation: false,    // ignores weapon type
            skillUsage: 'none',         // never uses active skills
            retreatThreshold: 0.1,      // only retreats when nearly dead
        },
    },
    beginner: {
        combat: {
            pursuitAggression: 0.4,
            circleStrafePreference: 0.1,
            dangerSensitivity: 0.5,
            leadFactor: 0.3,
            predictionNoise: 0.3,
            threatAwareness: 0.4,
            opportunism: 0.3,
            targetSwitchCooldown: 1200,
            bulletAwareness: 0.4,
            dodgeReactionMs: 400,
            dodgeCommitment: 0.4,
            preemptiveDodge: false,
            weaponAdaptation: false,
            skillUsage: 'panic',        // only uses skills when health is low
            retreatThreshold: 0.25,
        },
    },
    intermediate: {
        combat: {
            pursuitAggression: 0.6,
            circleStrafePreference: 0.4,
            dangerSensitivity: 0.7,
            leadFactor: 0.7,
            predictionNoise: 0.15,
            threatAwareness: 0.7,
            opportunism: 0.5,
            targetSwitchCooldown: 600,
            bulletAwareness: 0.7,
            dodgeReactionMs: 250,
            dodgeCommitment: 0.6,
            preemptiveDodge: false,
            weaponAdaptation: true,     // adjusts range by weapon
            skillUsage: 'tactical',     // uses skills when advantageous
            retreatThreshold: 0.3,
        },
    },
    advanced: {
        combat: {
            pursuitAggression: 0.8,
            circleStrafePreference: 0.7,
            dangerSensitivity: 0.95,
            leadFactor: 0.95,
            predictionNoise: 0.05,
            threatAwareness: 0.9,
            opportunism: 0.7,
            targetSwitchCooldown: 300,
            bulletAwareness: 0.95,
            dodgeReactionMs: 100,
            dodgeCommitment: 0.8,
            preemptiveDodge: true,
            weaponAdaptation: true,
            skillUsage: 'optimal',      // uses skills for maximum effect
            retreatThreshold: 0.35,
        },
    },
};
```

---

## Research: Shop Decision-Making

### Current Problems

The existing shop AI has four strategies:
1. **random** — buys a random affordable upgrade
2. **cheapest** — buys the cheapest available upgrade
3. **heuristic** — hardcoded priority list per build archetype
4. **optimal** — same as heuristic but with "better" priorities

None of these respond to how the session is actually going. A bot that keeps dying to WASP rushes buys the same upgrades as one cruising through waves untouched. The shop strategy should adapt based on observed performance.

### Game Shop Mechanics

**Shop flow** (from `js/modules/shop/shop-manager.js`):
- Shop opens after every wave (WAVE_TRANSITION → shop display)
- Player sees available upgrades with costs
- Player buys 0+ upgrades, then closes shop → next wave starts
- Coins earned from killing enemies and collecting money orbs
- Prices are fixed per upgrade type, not dynamic

**Build archetypes** (from `tools/ai-qa-bot/core/config.js`):
- `BALANCED`: mix of damage and defense
- `GLASS_CANNON`: all damage, no defense
- `TANK`: health and shields
- `SPEED_DEMON`: speed and fire rate
- Each has a `priorities` array like `['RAPID_FIRE', 'MULTI_SHOT', 'LONG_RANGE', ...]`

### Proposed: Utility AI Shop System

Replace hardcoded priority lists with a **utility scoring system** that evaluates each available upgrade based on session telemetry. Each upgrade gets a **need score** computed from recent performance data.

#### Session Telemetry (Tracked by Bot)

The bot already tracks some of this via fun metrics. Additional tracking needed:

```javascript
const sessionTelemetry = {
    // Survival
    avgHealthRatio: 0.0,          // mean health/maxHealth across last 5 waves
    deathCount: 0,
    deathsByCollision: 0,         // deaths from ramming enemies
    deathsByBullet: 0,            // deaths from enemy fire
    damageSourceBreakdown: {},    // { collision: 45%, bullet: 35%, ... }

    // Offense
    avgKillTime: 0,               // mean time (ms) to kill an enemy
    hitAccuracy: 0,               // bullets hit / bullets fired
    killsPerWave: 0,              // average
    overkillRatio: 0,             // damage dealt / damage needed (>1 = wasted DPS)

    // Economy
    coinsEarned: 0,
    coinsSpent: 0,
    avgCoinsPerWave: 0,

    // Engagement
    avgEngagementRange: 0,        // mean distance to enemy at time of kill
    timeInDangerZone: 0,          // % of time with enemy within DANGER_RADIUS
    bulletDodgeRate: 0,           // enemy bullets dodged / total aimed at player

    // Progression
    currentWave: 0,
    waveClearTime: [],            // ms per wave
    stalledWaves: 0,              // waves where timer ran out
};
```

#### Need Score Computation

Each upgrade computes a need score (0-1) based on telemetry:

```javascript
function computeNeedScores(telemetry, currentUpgrades) {
    const scores = {};

    // LONG_RANGE: High need if engagement range is beyond weapon range
    // (bot can't reach enemies → needs more range)
    const rangeCoverage = telemetry.avgEngagementRange / currentWeaponRange;
    scores.LONG_RANGE = clamp(rangeCoverage - 0.7, 0, 1);  // need rises above 70% range

    // RAPID_FIRE: High need if kill times are slow
    const killTimeFactor = clamp(telemetry.avgKillTime / 5000 - 0.3, 0, 1);
    scores.RAPID_FIRE = killTimeFactor * 0.8;

    // MULTI_SHOT: High need if accuracy is low (more bullets = more forgiving)
    scores.MULTI_SHOT = clamp(1 - telemetry.hitAccuracy, 0, 1) * 0.7;

    // HOMING: High need if accuracy is very low AND enemies are fast
    scores.HOMING = clamp(1 - telemetry.hitAccuracy - 0.3, 0, 1) * 0.9;

    // PIERCING: High need if overkill ratio is high (wasting DPS on single targets)
    // or if many enemies cluster together
    scores.PIERCING = clamp(telemetry.overkillRatio - 1.5, 0, 1) * 0.5;

    // HEALTH_BOOST: High need if avg health is low
    scores.HEALTH_BOOST = clamp(1 - telemetry.avgHealthRatio, 0, 1);

    // SHIELD_BOOST: High need if taking collision damage (shields prevent one-shots)
    const collisionPct = telemetry.damageSourceBreakdown.collision || 0;
    scores.SHIELD_BOOST = collisionPct * 0.9;

    // SPEED_BOOST: High need if dodging poorly
    scores.SPEED_BOOST = clamp(1 - telemetry.bulletDodgeRate, 0, 1) * 0.6;

    // CRIT_CHANCE / CRIT_DAMAGE: Moderate need in mid-game when base DPS is established
    const hasDPS = (currentUpgrades.RAPID_FIRE || 0) >= 2;
    scores.CRIT_CHANCE = hasDPS ? 0.5 : 0.2;
    scores.CRIT_DAMAGE = (currentUpgrades.CRIT_CHANCE || 0) >= 2 ? 0.6 : 0.1;

    return scores;
}
```

#### Purchase Decision Algorithm

```
1. Compute need scores for all upgrades
2. Filter to affordable upgrades (cost ≤ coins)
3. Filter out maxed upgrades (stacks ≥ maxStacks)
4. Compute value score = needScore / cost  (bang-for-buck)
5. Apply build archetype bias: multiply by 1.3 for upgrades matching archetype
6. Apply skill-level noise:
   - Novice: multiply each score by random(0.5, 1.5) — erratic choices
   - Advanced: no noise — always picks highest value
7. Buy highest-scoring upgrade
8. Repeat until coins < cheapest available or max 3 purchases per shop visit
```

#### Adaptive Build Strategy

Instead of picking a build archetype at the start and never changing, the bot should **discover its preferred archetype** based on session performance:

```javascript
function evaluateBuildFit(telemetry) {
    // If taking lots of damage → shift toward TANK
    // If kill times are slow → shift toward GLASS_CANNON
    // If dying to collisions → shift toward SPEED_DEMON
    // If roughly balanced → stay BALANCED

    const damageStress = 1 - telemetry.avgHealthRatio;
    const dpsStress = telemetry.avgKillTime / 5000;
    const mobilityStress = telemetry.deathsByCollision / Math.max(telemetry.deathCount, 1);

    if (damageStress > 0.6) return 'TANK';
    if (dpsStress > 0.6) return 'GLASS_CANNON';
    if (mobilityStress > 0.5) return 'SPEED_DEMON';
    return 'BALANCED';
}
```

The build archetype is re-evaluated every 5 waves, applying a 1.3× multiplier to upgrades that match the current archetype.

#### Saving Strategy (When NOT to Buy)

The bot should sometimes save coins instead of buying the cheapest thing:

```javascript
function shouldSave(coins, bestUpgradeCost, bestNeedScore, telemetry) {
    // Save if best available upgrade has low need
    if (bestNeedScore < 0.2) return true;

    // Save if close to affording a high-value upgrade
    const highValueUpgrades = getUpgradesWithNeedScore(telemetry, 0.7);
    const almostAffordable = highValueUpgrades.filter(u => u.cost <= coins * 1.5);
    if (almostAffordable.length > 0 && coins >= bestUpgradeCost * 0.6) return true;

    return false;
}
```

#### Shop Skill Parameterization

```javascript
shop: {
    decisionQuality: 0.7,      // 0-1, how optimal purchases are
    savingAwareness: 0.5,       // 0-1, ability to save for expensive upgrades
    adaptability: 0.6,          // 0-1, how quickly build shifts based on performance
    maxPurchasesPerVisit: 3,    // spending cap per shop visit
    evaluationWindow: 5,        // waves of telemetry to consider
}
```

Skill level maps:
- **Novice**: `decisionQuality: 0.2`, `savingAwareness: 0.0`, `adaptability: 0.1` — buys random cheap stuff, never saves, sticks to initial build
- **Beginner**: `decisionQuality: 0.4`, `savingAwareness: 0.2`, `adaptability: 0.3` — slightly better choices, rarely saves
- **Intermediate**: `decisionQuality: 0.7`, `savingAwareness: 0.5`, `adaptability: 0.6` — decent value assessment, sometimes saves for key upgrades, adapts build mid-session
- **Advanced**: `decisionQuality: 0.95`, `savingAwareness: 0.8`, `adaptability: 0.8` — near-optimal purchases, frequently saves for high-value upgrades, rapidly adapts to session needs

---

## Non-Goals

- **Replacing the combat AI's decision-making with the humanizer** — the humanizer adds noise/delay to execution, not strategy. The combat AI decides *what* to do; the humanizer affects *how precisely* it's done. (The combat AI improvements in this document are separate from the humanizer.)
- **Implementing actual mobile/gamepad controls in the game** — that's tracked in SKU_deployment.md. This plan only creates the QA bot's simulation layer.
- **Machine learning or reinforcement learning** — the system uses parameterized models, not learned policies. This keeps it deterministic (given a seed), fast, and interpretable.
- **One-punch-man removal** — the QA bot does NOT use the one-punch-man cheat. The cheat is only used in `tests/helpers/game-ai.js` (E2E test helper) for fast test execution. No changes needed.
