# Rainboids — Bug-Pass Audit Report

**Date:** 2026-05-25 · **Version audited:** 6.187.1 (`VERSION`)

## Methodology + scope

Static read-through of the code shipped/integrated in the most recent ~20 versions, prioritizing the highest-risk integrations per the audit brief:

1. Enemy enabling-system abilities (`js/modules/enemy/abilities/*.js`, `telegraph.js`) + their wiring in `enemy.js`.
2. Collision hot path (`js/modules/combat/collision-system.js`) — the three bullet pre-passes + `applyDamageToEnemy` + the player-enemy/contact paths.
3. Difficulty director + RUN system (`difficulty-director.js`, `wave-data.js`, `wave-manager.js`, `reward-dial.js`, `player/lifecycle.js`).
4. Bosses (`boss-phases.js`, `boss-parts.js`, `bosses/*`, boss driver wiring).
5. Economy/items (`world/item-system.js`, `world/cores.js`, `player/progression.js`).

Confirmed hypotheses by reading callers, tests (`tests/unit/**`, `tests/qa/**`), and `node --check` on the new pure modules (all parse clean). All findings are analysis + proposed fixes only — **no source was modified.**

## Summary counts

- **Critical:** 0
- **High:** 2
- **Medium:** 2
- **Low:** 4
- **Design/tuning risk (informational):** 2

The new ability helper modules (`cloak.js`, `reflect.js`, `projectile-absorb.js`, `blink-burrow.js`, `buff-strip.js`, `suppress-aura.js`, `telegraph.js`) and `difficulty-director.js` are individually well-written, pure, and unit-tested. Most issues are at **integration seams** (collision pre-pass gating, run-config vs. hard-coded wave data), not in the helpers themselves.

---

## High

### H1 — PRISM_MIRROR reflect has NO distance gate: it reflects player bullets anywhere on the field

**File:** `js/modules/enemy/abilities/reflect.js:45-53` (`bulletInReflectArc`) + `js/modules/combat/collision-system.js:2784-2844` (`routeBulletToReflect`)

**What's wrong / when it triggers:** `bulletInReflectArc` tests only the **angle** from the mirror to the bullet against `halfAngleRad` — there is no range/distance check. `routeBulletToReflect` scans *all* active enemies and reflects the first bullet for which `shouldReflect` is true, again with no proximity gate. Player bullets never set `isBeam`/`isMelee`/`bypassReflect`, so **every** standard player bullet is reflectable. The consequence: a PRISM_MIRROR reflects any player bullet anywhere on the screen as long as it falls within the mirror's front 120° arc — not just bullets actually striking the mirror. A bullet streaking across the far side of the field gets yanked (consumed + an enemy bullet spawned back) the instant it enters the arc cone. Piercing/bounce bullets are also consumed (their pierce/bounce is lost). The maw/absorb sibling (`projectile-absorb.js:50`) *does* gate on `m.range`; reflect was never given the equivalent.

**Impact:** A single PRISM_MIRROR effectively erases a large angular swath of the player's fire across the whole arena and turns it into incoming enemy bullets — far stronger than the documented "a bullet that **strikes** inside the front arc" design, and a huge difficulty spike on waves 23/28.

**Severity:** High

**Proposed fix:** Give reflect a `range` like the maw and gate on it.
- In `REFLECT_DEFAULTS` (reflect.js:23) add `range: 120` (tune to the mirror's collider/visual size).
- In `bulletInReflectArc`, before the angle test, add a distance gate mirroring `bulletInMawCone`:
  ```js
  const r = enemy.reflect;
  const dx = bullet.x - enemy.x, dy = bullet.y - enemy.y;
  const dist2 = dx*dx + dy*dy;
  if (typeof r.range === 'number' && dist2 > r.range * r.range) return false;
  ```
  (keep the existing `dx===0&&dy===0` degenerate short-circuit). Add `range` to `PRISM_MIRROR.reflectOpts` in `enemy-data.js:692`. Note: the existing QA test (`tests/qa/25-reflect.spec.js`) places the test bullet at `e.x + 20` so it stays in-range and will still pass; add a "far bullet in-arc is NOT reflected" case.

---

### H2 — Custom run length (RUN-06) breaks boss spawning: hard-coded WAVE_DATA boss entries are silently dropped or never reached

**File:** `js/modules/wave/wave-manager.js:656-659` / `:751-756` (subwave spawn) + `:935-944` (`spawnStageBoss`) + `js/modules/wave/wave-data.js:349-358` (`getWaveConfig`) / `:367-371` (`isBossWave`)

**What's wrong / when it triggers:** RUN-06 lets the player pick `wavesPerStage ∈ {3,6,9}` and `stages ∈ [10,100]` (`game-engine.js:1196-1201`), so `runMaxWaves` can be 60–900 and `runWavesPerStage` can be 6 or 9. Two integration mismatches result:

1. **Boss-wave disagreement (wps ≠ 3).** `WAVE_DATA` hard-codes boss subwave entries (`{ isBoss: true }` + `isBossWave: true`) at the fixed waves 3,6,9,…,30. The live spawn path hits an `isBoss` entry and calls `spawnStageBoss` (wave-manager.js:656/751), which **re-checks** `isBossWave(wave, runWavesPerStage(game))` (wave-manager.js:938) and returns `null` when `wave % wps !== 0`. The caller `continue`s **unconditionally** (it doesn't fall back to spawning the entry's escort/TITAN), so at e.g. wave 3 with `wps=6`, the boss entry spawns **nothing** — no boss and no part of that group. The stage-final boss simply never appears.

2. **Past wave 30 → trivial fallback.** `getWaveConfig(w, mw)` clamps `w = min(mw, waveNumber)` then `WAVE_DATA[w] || WAVE_DATA[1]` (wave-data.js:351-352). For any wave 31–`mw` there is no `WAVE_DATA` entry, so every wave beyond 30 falls back to **wave 1's content** (3 HUNTERs) — and wave 1 has no `isBoss` entry, so `spawnStageBoss` is never even invoked for the real stage finals of an extended run. Long runs degenerate into endless trivial wave-1 spawns with no bosses.

**Impact:** Any non-default run shape (the whole point of RUN-06) is broken — missing or misplaced bosses, and trivial content past wave 30. Confined to the experimental RUN-06 feature, so not Critical, but it defeats the feature.

**Severity:** High (for the RUN-06 feature path); the default 10×3 run is unaffected.

**Proposed fix:** Decouple boss spawning from the hard-coded table and make content procedural past 30, e.g.:
- Drive boss spawns off `isBossWave(wave, runWavesPerStage(game))` directly (a stage-final marker) rather than the per-entry `isBoss` flag, OR make the `isBoss` `continue` fall back to `spawnLeveledEnemies` when `spawnStageBoss` returns `null`.
- In `getWaveConfig`, for `waveNumber > 30` synthesize a config from the nearest in-range stage pattern (and inject an `isBoss` entry on stage finals) instead of falling back to `WAVE_DATA[1]`. Until that exists, RUN-06 should clamp `stages` so `runMaxWaves ≤ 30`, or the UI should warn that >30-wave runs are unsupported.

---

## Medium

### M1 — Boss-bonus gold uses default wavesPerStage, ignoring the run config

**File:** `js/modules/wave/wave-manager.js:1804`

**What's wrong:** `if (justCleared > 0 && isBossWave(justCleared))` calls `isBossWave` with **no** `wavesPerStage` argument, so it defaults to `WAVES_PER_STAGE = 3` — every other boss/stage check in this file threads `runWavesPerStage(this.game)` (e.g. lines 371, 938, 188). With a non-default `wps` the 200+ gold "BOSS BONUS" fires on waves 3/6/9… regardless of where the run's actual boss waves are, and misses the real ones.

**Impact:** Wrong/missing boss-clear gold for non-default runs; inconsistent with the rest of the run-config plumbing. (Default run is correct since wps is 3.)

**Severity:** Medium (Low outside RUN-06)

**Proposed fix:** `if (justCleared > 0 && isBossWave(justCleared, runWavesPerStage(this.game)))`.

### M2 — `feedDirectorOnWaveClear` can spike Po if `_waveStartMs` is ever unset

**File:** `js/modules/wave/wave-manager.js:334` + `buildDirectorOutcome` `js/modules/wave/wave-manager.js:306-311`

**What's wrong:** `const actualClearTime = Date.now() - (this._waveStartMs || Date.now())`. If `_waveStartMs` is ever falsy at clear time (it's normally set in `spawnWaveEntities:617`, but a director that ingests a clear before any `spawnWaveEntities` set the stamp — e.g. a wave restored from a snapshot, or a future code path that clears wave 1 without the normal spawn) yields `actualClearTime = 0`, clamped to `1` ms by `Math.max(1, …)`. Then `dpsOnTarget = 1/1 = 1` and `expectedDps = 1/targetClearTime` (tiny), so `dpsRatio = targetClearTime` (e.g. ~25000) and `speedRatio` is likewise huge → `rawPo` explodes. Cold-start (waves 1-2 held at D=1) masks this for the first two waves, but a mis-stamped later wave would slam D_hp toward its 3.0 ceiling in one EMA fold.

**Impact:** Latent — requires `_waveStartMs` to be unset on a non-cold-start clear, which the current normal flow avoids. Worth hardening because the failure mode is a silent, hard-to-debug difficulty spike.

**Severity:** Medium (needs confirmation that no live path clears a wave without the stamp)

**Proposed fix:** Treat a missing/zero stamp as "no signal": if `!this._waveStartMs`, skip the director feed for that wave (just reset `_waveHits`), or default `actualClearTime` to `targetClearTime` so the ratio is a neutral 1.0 rather than a spike.

---

## Low

### L3 — `addPowerup` returns `undefined` on success (callers can't distinguish granted vs. refused)

**File:** `js/modules/player/progression.js:212-251`

**What's wrong:** The function `return false` on the suppression guard (217) and on the at-cap path (227), but the **success** branch falls through to the end with no `return`, yielding `undefined`. Any caller treating the return as a boolean ("was it granted?") sees a falsy value on success. The buff-strip suppression itself works (it's enforced via `_buffSuppressed` at line 217), so this is a contract/clarity bug, not a functional break of the strip.

**Severity:** Low

**Proposed fix:** Add `return true;` at the end of the success path (after the `HEALTH_BOOST` block) so the function consistently returns a boolean.

### L4 — Reward Dial's Cores-salvage scaling is never applied at the salvage UI

**File:** `js/modules/world/cores.js:45-58` (`salvageValue` / `totalSalvage`) + `js/modules/ui/armory-overlay.js:177,293,522`

**What's wrong:** `salvageValue(item, rewardMult = 1.0)` accepts a Reward-Dial multiplier (RUN-03), and the module doc says richer runs "pass the `rewardMultiplier()` factor to grant more Cores per salvage." But every live call site (`armory-overlay.js`, and `totalSalvage` itself at cores.js:57) calls `salvageValue(it)` with **no** `rewardMult`, so the dial never reaches salvage. The Cores reward-scaling promised for wps ≥ 6 runs is dead.

**Severity:** Low (feature-not-wired; default runs unaffected, dial returns 1.0 anyway)

**Proposed fix:** Thread `rewardMultiplier(game, wave)` into the armory salvage calls (and into `totalSalvage`), or drop the `rewardMult` parameter if Cores were intentionally left out of the dial.

### L5 — `EnemyBullet.reset()` does not clear `reflected` (benign today, latent footgun)

**File:** `js/modules/enemy/enemy-bullet.js:25-120` (`reset`) + set at `collision-system.js:2817`

**What's wrong:** A reflected bullet is flagged `eb.reflected = true` after `reset` in `routeBulletToReflect`, but `reset()` never re-clears `reflected`, so a recycled enemy-bullet pool object carries `reflected = true` into its next, normal life. Today this is harmless because `bullet.reflected` is only read by `shouldReflect` (reflect.js:63), which is only ever called on **player** bullets (a separate pool) — a stale flag on an enemy bullet is never consulted. It becomes a real bug the moment any code reads `reflected` on enemy bullets (e.g. a future "reflected bullets get a different tint / can't be re-reflected by a mirror that also targets enemy bullets").

**Severity:** Low (latent)

**Proposed fix:** Add `this.reflected = false;` to `EnemyBullet.reset()` alongside the other pool-reuse clears (it already resets `_eyeSlowed`, `shooter`, `bossRageHoming`, etc.).

### L6 — `partitionBulkSalvage` keeps items whose slot has no equipped peer (and any item with a null slot)

**File:** `js/modules/world/cores.js:121-130`

**What's wrong:** `below = eq && scoreFn(it) < scoreFn(eq)`. If `equippedBySlot[it.slot]` is `null`/absent (no item equipped in that slot), `eq` is falsy → `below` is false → the item is always **kept**, never offered for bulk salvage, even if it's junk. Likely intended ("don't salvage if you have nothing equipped there"), but it means a player who hasn't equipped a slot can never bulk-salvage that slot's dupes. Flagging for confirmation that this is the intended UX.

**Severity:** Low (needs confirmation it's intended)

**Proposed fix:** If unintended, treat a missing `eq` as "salvageable if strictly below the best stash item in that slot," or expose a separate "salvage unequipped duplicates" rule.

---

## Design / tuning risks (informational, not bugs)

### D1 — Director hits-survived feedback can mildly self-reinforce threat

**File:** `js/modules/player/lifecycle.js:245,335` + `js/modules/wave/difficulty-director.js:110-111`

D_thr scales incoming damage (`scaledDamage`), and a hit that deals HP loss increments `_waveHits` (lifecycle:335), which feeds `hitsSurvived → hitsRatio → rawPd` (a higher `Pd` raises threat). So "take more hits" nudges the director toward "you're tanky → more threat." The mercy gate (`hpRetainedFrac ≤ 0.1` or `Pd < 1-deadband`) and the EMA/deadband/rate-limit damp it, and RUN-07 is slated to calibrate, so this is a tuning watch-item, not a defect.

### D2 — A sustained CHILL field can permanently disable WRAITHWORM's blink

**File:** `js/modules/combat/combat-manager.js:2151-2157` + `js/modules/enemy/abilities/blink-burrow.js:57-75`

`applyChill` mirrors `chillUntil` into `_frozenUntil`, and `isFrozen` blocks blink whenever `_frozenUntil > now`. A continuously-refreshed CHILL source (e.g. Eye of the Storm re-applying a slow every frame) keeps `_frozenUntil` perpetually in the future, fully suppressing the WRAITHWORM's signature relocate for as long as the player holds the field. The code comment ("the slow holds it in place") suggests this is intended, but the *full* lockout (vs. a partial cooldown stretch) is worth a deliberate balance decision.

---

## Areas reviewed and found clean (confidence)

- **Ability helpers** — `telegraph.js`, `cloak.js`, `projectile-absorb.js`, `blink-burrow.js`, `buff-strip.js`, `suppress-aura.js`: pure, correct angle-wrap math (`angleDelta` handles the ±π seam), divide-by-zero guards, no `Date.now`/globals, sensible pool-reuse contracts. (Reflect's *missing range gate* is the lone defect — H1.)
- **Pool-reuse resets in `enemy.js:155-215,380-398`** — `cloak`, `blink`, `maw`/`_absorbShield`/`_absorbShieldUntil`, `reflect`/`reflects`, `suppressAura`, `stripsBuff`/`_lastStripAt`, `_revealedUntil`, `_markUntil`, `_frozenUntil` are all explicitly reset on spawn (even for non-ability types), so a recycled entity cannot carry a prior occupant's ability state.
- **Time-base consistency** — `frameClock.now` *is* a per-frame-cached `Date.now()` (`core/frame-clock.js`), so the mix of `frameClock.now` (ability stamps/reads, collision) and `Date.now()` (boss driver, suppress/buff-strip readers in `abilities.js`/`progression.js`/`status.js`) share one epoch; the only difference is sub-frame staleness — not a duration/expiry bug.
- **`applyDamageToEnemy` ordering** (`collision-system.js:2494-2669`) — passive mults → resist (multi-element average) → corrode/conduct → ally-shield → armor/frontal-shield (Radiant purge gates both) → **absorb-shield soak last** (drains in already-mitigated units, no double-count). Clean.
- **Reflected-bullet self-hit guard** — `eb.shooter = enemy` + the friendly-fire loop's `if (enemy === bullet.shooter) continue` (collision-system.js:1196) correctly prevents a mirror's reflected bullet from hitting the reflector; `reflected:true` + the H1-fixed arc prevent re-reflection ping-pong.
- **`difficulty-director.js`** — `safeRatio` guards every divisor, `clamp`/`rateLimit`/deadband bound every step, cold-start holds waves 1-2, cross-term/mercy/escalation gates are internally consistent; `getThreatLevel` pip mapping is monotonic. Well unit-tested (`tests/unit/difficulty-director.test.js`).
- **`reward-dial.js`** — exact-1.0 default-run guarantee, finite/clamped factors, no NaN paths.
- **`cores.js` cost/affix math** and **`item-system.js` resist-cap + `applyResistTarget` + `rerollItemPassive`** — tier gates, dedupe invariants, and count-stable ADD/SWAP logic are correct.
- **`boss-phases.js` / `boss-parts.js`** — once-each `onEnter` (even on multi-threshold single-frame drops), transition invuln, `coreBlocksDamage` gating, orbit/offset world-position math, single-fire `onDestroy`. Clean (the only theoretical risk is a *descriptor* placing an unreachable shielding part → permanent core invuln, which is a per-boss data concern, not a logic bug).
- **`player/lifecycle.js takeDamage`** — D_thr applied before the FAILSAFE per-hit cap, burn-DoT path returns early so it's never double-scaled, shared `_resolvePlayerLethal` pipeline. Clean.
