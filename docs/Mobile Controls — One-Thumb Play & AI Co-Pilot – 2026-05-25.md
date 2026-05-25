# Mobile Controls — One-Thumb Play & the AI Co-Pilot

**Status:** Plan / Design (revised — review pass folded in 2026-05-25)
**Date:** 2026-05-25
**Scope:** Solo (`/`). Make the *complete* game fun and winnable on a phone with one thumb on a single analog stick (plus tap-to-dash) and **no on-screen buttons**, by handing aiming, firing, power use, and ability timing to a deterministic **AI Co-Pilot** — the mobile front-end of the unified **Assist System**.

> **Read [Controls & UI Overhaul — Master Roadmap] first.** The Co-Pilot *is* the Assist System (Master §5 / P0.4); the gamepad/desktop opt-in assists share the same engine. This work is **rank 2** (ability auto-cast) and **rank 4** (auto-dodge + UX) per the roadmap. The `autoCast` role metadata (P0.3) is a prerequisite.

---

## 1. The core idea — and what the player's *job* is (M4)

On mobile the player has essentially **one job: positioning** — steer to dodge, choose engagement range, herd enemies into your AoE. Aiming, primary fire, power use, and the 4 abilities are handled by the Co-Pilot.

But "auto-everything, steer-only" risks feeling like a screensaver. So the **default mobile level keeps two active verbs in the player's hands**: **steering** (the stick) and **dash timing** (tap-to-dash). Tap-to-dash is a *gesture*, not a button — it satisfies "no buttons" while preserving the single most expressive defensive skill. The Co-Pilot's auto-dodge is, by default, a **conservative safety net** that only fires when a hit is otherwise unavoidable — so the player's own dash taps remain the primary dodge and *matter*.

This is the resolution of the central design risk: **the game is a positioning + dash-timing game with an automated offense layer**, not an idle game. Skill expression lives in *where you stand, when you dash, and what you built*. (Players who want true hands-off get the "Autopilot" accessibility level; players who want full control get "Manual Touch.")

### Assist levels
| Level | Player does | Co-Pilot does | For |
|---|---|---|---|
| **Co-Pilot** *(default)* | Steer + tap-to-dash | Aim, fire, power, abilities; **auto-dodge = conservative safety net** | Most players |
| **Autopilot** *(accessibility)* | Steer only (or nothing) | Everything incl. **aggressive auto-dodge** | One-handed / very casual / accessibility |
| **Manual Touch** | Steer + on-screen buttons | Aim/fire assist only | Control purists |

All systems stay in play — rarities, every weapon and ability still fire and matter; skill shifts from twitch execution to **positioning + build**, which makes the Items/Armory UX doubly important on mobile.

---

## 2. Current state (facts, with file refs)

All paths under `/Users/silvr/projects/rainboids`.

- **Single analog stick** — `js/modules/ui/analog-stick.js` (normalized `{x,y,magnitude}`, side persists in `localStorage`).
- **Touch router** — `js/modules/ui/mobile-touch.js`: drag = move; **tap (release <350 ms, drift <16 px) = directed dash toward tap**; auto-aim + auto-fire **forced on**; abilities/radials **unreachable** from touch.
- **Aim-assist / auto-aim / auto-fire** — `player.js`: Auto-Aim `:710–719`; Aim-Assist snap 90 px `:749–756`; Auto-Fire range + **25° cone** `:781–813` (also fires power "whenever ready + target in cone" — the blunt behavior we replace).
- **Target query** — `findNearestTarget(x,y,maxDist)` `game-engine.js:5000–5033`.
- **Homing reference** — `bullet.js:587–705` (predictive lead, turn-rate-limited).
- **Reactive bot template** — `tests/helpers/game-ai.js` (threat collection, nearest-threat dodge w/ perpendicular slide, world→WASD).
- **Threat signals** — `wave/difficulty-director.js`: `getThreatLevel` 1–5; `D_hp`/`D_thr`; `getEnemyPower`.
- **Player state per frame** — HP, shield, energy, pos, angle, `isDashing`, `dashCooldown`, `equippedAbilities[4]`, `abilityCooldowns[4]` (+max), `activeAbilityEffects`, `powerCooldown`, `isPowerReady()`, `player.radius`, `player.vel`.
- **Pools + spatial grid** — `enemyPool/asteroidPool/enemyBulletPool.activeObjects` (mines = `shape 'mine'|'homing_mine'`), `spatialGrid` (8×6, O(k) retrieve).
- **Ability cooldowns** (from `weapon-data.js`): BULWARK 20s/50%DR/4s · FIELD_MEDIC 22s/heal45%+cleanse · DEFLECTOR_ORBS 15s · EMP_PULSE 22s/stun r200/2s · SENTRY_DRONE 18s · + BLINK, GRAVITY_SNARE, DESIGNATOR, SECOND_WIND, CRYO/STASIS/STORM/PYRE fields, ELEMENTAL_INFUSION. Powers 4–10s + energy.

### The gap
Abilities never fire on mobile, and the power weapon is spammed bluntly. The Co-Pilot closes this with situation-aware casting and a real dodge model.

---

## 3. The AI Co-Pilot — architecture (Assist System front-end)

Lives in `js/modules/assist/` (Master P0.4). **Two loops at different rates (M1)** — this matters: a single 10 Hz loop is too slow to dodge fast projectiles.

```
FAST loop  (~30 Hz or per-frame): senseThreats() → auto-dodge decision   (latency-critical)
SLOW loop  (~10 Hz):              senseSituation() → decideCast() → act() (deliberate casts)
```

### 3.1 Sense — threats with correct kinematics (M2)
A projectile is "incoming" using **relative velocity** (bullet vs the *moving* player), not bullet-vs-static-player:

```js
const rvx = b.vel.x - player.vel.x, rvy = b.vel.y - player.vel.y;   // relative velocity
const toP = { x: px - b.x, y: py - b.y };
const closing = (toP.x * rvx + toP.y * rvy) > 0;
const relSpeed = Math.hypot(rvx, rvy) || 1e-3;
const dist = Math.hypot(toP.x, toP.y);
const tti = dist / relSpeed;                                        // time-to-impact
const miss = Math.abs(toP.x * rvy - toP.y * rvx) / relSpeed;        // perpendicular miss dist
const willHit = miss < (player.radius + b.radius + PAD);
// Homing/curving projectiles defeat linear prediction:
if (b.shape === 'homing_mine' || b.homing) {                        // treat as always-incoming in range
    if (dist < DANGER_R) incoming.push({ b, tti: dist / Math.max(relSpeed, ENEMY_SPEED_REF), dist });
} else if (closing && willHit && dist < DANGER_R) {
    incoming.push({ b, tti, dist });
}
```
Projectile sensing is filtered through the **spatial grid** around the player, not a full pool scan (M9) — keeps the fast loop within a measured budget rather than an assumed one.

The slow loop builds the full `Situation` (HP/energy fracs, enemy cluster centroid + density for AoE, crowding, surroundedness over 8 octants, bossPresent, director threatLevel) once per cast tick.

### 3.2 Decide — role-driven, near-zero per-item tuning (M6)
Each ability/power carries `autoCast: { role, targeting, aoeRadius, minThreatLevel }` (Master P0.3). **Behavior is driven by the role's shared default heuristic**; per-item numeric weights are rare optional overrides, so new content just needs a role tag.

| Role | Cast when | Aim | Examples |
|---|---|---|---|
| `heal` | `hpFrac < 0.40` (re-arm only above 0.45) | self | FIELD_MEDIC, SECOND_WIND |
| `mitigate` | imminent burst (`minTTI < 0.6s`, `incomingCount ≥ 2`) or `hpFrac < 0.55` while threatened | self | BULWARK, DEFLECTOR_ORBS |
| `escape` | `surroundedness ≥ 5` or unavoidable burst + dash on cd | away from density | BLINK |
| `cc` | `crowding ≥ 3` in radius, or melee contact imminent | self / centroid | EMP_PULSE, GRAVITY_SNARE, STASIS_FIELD |
| `zone` | stable cluster (`crowding ≥ 3` for ≥0.5s) | clusterCentroid | CRYO/STORM/PYRE fields |
| `summon` | ≥2 enemies present, keep uptime | self | SENTRY_DRONE |
| `buff` | threatLevel ≥ 3 (pre-spike) | self | ELEMENTAL_INFUSION |
| `nuke` | high AoE value, or boss present | centroid / boss | NOVA_BLAST, ORBITAL_STRIKE, SINGULARITY |
| `snipe` | high-value/elite/boss target aligned & in range | nearest high-value | CHARGE_SHOT, MISSILE_SALVO, RAIL-likes |

Among *ready* capabilities (cooldown ≤ 0, energy ok, `threatLevel ≥ minThreatLevel`), cast the highest role-priority match above threshold. **Emergency override:** dire situations (`minTTI < 0.3s`, dash unavailable, low HP) bypass the per-tick budget. **Anti-spam:** ≤1 "big" cast per ~0.4 s (dodge excepted), per-role hysteresis, and no re-stacking effects already in `activeAbilityEffects`.

### 3.3 Power-weapon auto-cast (replaces the blunt branch)
Supersede the "fire power whenever ready + target in cone" in `player.js:781–813` (and ensure the Co-Pilot is the *single* author of power-fire to avoid double-firing): AoE powers fire on worthwhile clusters (aim biased to the cluster centroid), single-target burst targets the highest-value enemy (boss/elite), MINE_LAYER drops into approach lanes. CHARGE_SHOT's energy model still governs *readiness*; the Co-Pilot only judges *worth*.

### 3.4 Auto-Dodge — optimize *landing position*, not ray openness (M3)
Because dash grants i-frames for the whole burst (`isDashIFrameActive`: 250 ms + 1 s tail, longer with PHASE_ECHO), surviving the *current* bullet doesn't depend on direction — **where you end up does**. Score candidate dash *destinations*, not rays:

```js
// candidate angles: 8 octants + current steer dir; dash distance ≈ DASH_DISTANCE_PX (135)
for (const a of candidates) {
    const lx = px + Math.cos(a) * DASH_DISTANCE_PX, ly = py + Math.sin(a) * DASH_DISTANCE_PX;
    score = distToNearestThreatAt(lx, ly)        // safety of the destination
          - outOfBoundsPenalty(lx, ly)           // don't dash into walls / off-field
          + awayFromClusterBonus(lx, ly);        // prefer landing away from enemy mass
}
dashTo(argmax);
```
Trigger only when `dashReady` **and** a hit is genuinely imminent (don't pre-burn i-frames). **Manual tap-dash always wins** and refreshes intent. At the **Co-Pilot** level this is conservative (player dashes first); at **Autopilot** it's aggressive.

---

## 4. Mobile control scheme & feedback

| Gesture | Co-Pilot (default) | Autopilot | Manual Touch |
|---|---|---|---|
| Drag stick | Move | Move | Move |
| Quick tap | Manual dash toward tap (overrides auto-dodge) | (optional) | same |
| **Optional single "Smart-Cast" button** | hidden (or shown if enabled) | hidden | replaced by full buttons |
| On-screen buttons | none | none | power + 4 abilities + dash |

**Multi-finger gestures dropped (M5).** Double-tap collides with rapid tap-dashing; two-finger taps collide with pinch/scroll and misfire mid-dodge. Instead, the *only* optional addition is a **single on-screen "Smart-Cast" button** that triggers the Co-Pilot's best-recommended cast on demand — reliable, one thumb, no disambiguation. It's off by default (true no-button play) and toggleable for players who want a moment of agency.

### Feedback (so automation feels alive)
- **Ability cooldown pips** that **flash + ping** on each auto-cast (revive the stubbed cooldown HUD, `hud/status.js:469`; these are the same pips the Items loadout panel renders).
- A brief **"BULWARK ↑" / "EMP" toast** per cast (reuse pickup-toast).
- A subtle **co-pilot glow** when auto-dodge fires.

### Death feedback (M8)
In an auto-played positioning game, losing must teach *why*. On death, show a one-line cause read from the kill event ("Cornered by 3 Hunters" / "Caught in Titan barrage") so the player learns positioning rather than blaming the Co-Pilot.

---

## 5. Keeping the *whole* game fun on one thumb

- **Positioning is the game** (M4): encounter design should reward where you stand — clustering for AoE, kiting at optimal range, baiting bullets to dash. Builds (loadout/rarities/attunements) become the primary meta — see the Items & Inventory plan.
- **Difficulty fairness is mostly self-solving (M7):** the director is **reactive** (D_hp/D_thr) and already adapts to whatever DPS assisted play produces — so we *verify fairness* via survival sims rather than hand-calibrating a bespoke "assisted-offense baseline." (The originally-planned calibration milestone is removed.)
- **Telegraphing:** auto-dodge is only fair if threats have visible wind-ups; verify boss/dense patterns telegraph with enough lead time.
- **Honest i-frame economy:** auto-dodge spends the same dash resource the player would; it can't out-pace the 1.5 s cooldown, so positioning still carries the load.

---

## 6. Settings & onboarding

- **Assist Level** (Co-Pilot / Autopilot / Manual Touch); default Co-Pilot on detected mobile.
- **Granular toggles:** Auto-Dodge (off / conservative / aggressive), Auto-Cast Abilities, Auto-Power, Auto-Aim, Smart-Cast button.
- **Aggression slider:** scales cast threshold + heal/mitigate thresholds.
- **Stick side** (existing).
- **One-time onboarding card:** "Steer to dodge, tap to dash — your Co-Pilot aims, fires, and triggers abilities."
- **Shared with gamepad/desktop:** the same Assist System exposes opt-in auto-cast of survival abilities on controller (Gamepad doc §3.1).

---

## 7. Implementation phases (mapped to roadmap)

**Prereq:** Master P0.3 (`autoCast` metadata) + P0.4 (Assist System Sense layer + config).

**P2 (rank 2) — Ability auto-cast.** Implement Decide (role heuristics) + Act (`player.activateAbility`); wire cooldown-pip flash feedback. Solo MINOR + CHANGELOG.

**P5 (rank 4) — Auto-dodge + mobile UX.** Split-rate Sense (fast dodge loop), relative-velocity threat math, landing-position dodge scoring; assist levels; optional Smart-Cast button; death-cause readout; onboarding + settings; replace the blunt power-fire branch (§3.3). README + tutorial updates.

---

## 8. Testing

- **Unit (Jest):** pure `senseSituation(snapshot)→Situation`, `decideCast(...)→action`, and the dodge scorer. Test: relative-velocity TTI & willHit; homing-as-always-incoming; heal hysteresis; mitigate on imminent burst; nuke prefers clusters/boss; anti-spam budget; emergency override; dodge picks the safest *destination*.
- **Survival sims:** run `tests/helpers/game-ai.js` as a **positioning-only bot** (strip `input.fire`; Co-Pilot drives offense/abilities) across waves + all difficulty MODEs; assert survivability and fairness via director telemetry (Master §7).
- **Perf:** confirm the fast dodge loop + spatial-grid projectile filter stays within a **measured** mobile frame budget (not assumed).
- **Devices:** iOS Safari + Android Chrome; portrait/landscape; notch safe-areas; stick on both sides.

---

## 9. Open questions (residual)

- **Auto-dodge default = conservative** (player dashes; AI saves only the unavoidable). Aggressive is the Autopilot/accessibility setting. Validate it feels like a *save*, not a hijack.
- **Smart-Cast button default off** (true no-button play); on is a one-thumb agency option. Decide from playtest whether to surface it by default.
- **AoE aim bias:** only the *power's* target shifts to the cluster centroid; the primary keeps shooting the nearest threat (so the player still sees consistent fire).
- **`autoCast` coverage:** ship base abilities/powers first; backfill newer abilities (BLINK, STASIS_FIELD, …) by role as follow-up — trivial since role drives behavior.
