# Director & Codebase Audit — Synthesis & Recommendations

**Date:** 2026-05-25 · **Version audited:** 6.187.1 · **Author:** first-layer audit pass (adaptive-difficulty stress analysis + codebase bug-pass).

**Supporting appendices (full detail):**
- `Adaptive Difficulty — Stress-Test Raw Data – 2026-05-25.md` — the build-math + director-trajectory tables (reproduce: `node tests/stress/*.analysis.mjs`).
- `Bug-Pass Audit — Findings & Fixes – 2026-05-25.md` — every bug with file:line + a proposed fix.

The stress tests live in `tests/stress/` as standalone `*.analysis.mjs` scripts — **analysis, not validation**: they calculate in-game numbers + drive the *real* `difficulty-director.js`, assert nothing, and are **excluded from `npm run test:unit`** (still 1456/124, confirmed). They're meant to be specialty-run for insight.

---

## Executive summary

The **core design of the adaptive difficulty is sound and empirically validated** — the geometric PWR blend and the two-axis decoupling do exactly what the design docs promise. But the **shipped director is a first-pass** with two concrete bugs and a structural ceiling that makes it **insufficient for strong builds and long runs** — precisely the gap the new **DIR §14 track** (now at the top of `Plans.md`) closes. Separately, the bug-pass found **0 Critical, 2 High, 2 Medium, 4 Low** issues — mostly at integration seams, not in the (well-tested) helper modules.

**Headline numbers** (10 archetypes, real weapon-data + real director):
- Build-power spread is **~298× in DPS / ~265× in EHP** — far wider than the docs' "~20×" (which compared only two *designed* builds). The PWR metric **compresses this to ~68×** — the geometric blend works.
- Only **2 of 10 builds** currently land in the intended "challenged-but-winning" flow channel; the rest break out (god-tier faceroll above, bullet-sponge/mercy below).
- The current director's missing PWR pre-load costs a god build a **~9.7-wave** catch-up runway, and its hard D_hp ceiling (3.0) **saturates** in deep runs (the §14 baseline curve wants ×9.4 by wave 20, ×65 by wave 90).

---

## Part 1 — Adaptive Difficulty: what works, what's flawed

### ✅ What the system does well (validated by the stress run)

1. **PWR geometric blend refuses to over-rate one-dimensional builds.** DPS spread 298× → PWR spread 68×. A **Glass Nuke (PWR 730)** lands *below* a **Balanced build (827)** despite ~11× the DPS, because its near-zero survivability drags the `O^0.45·S^0.35·U^0.20` product down. This is exactly the intended behavior (Tuning §4) — it protects the glass cannon from being pre-loaded into enemies it can't survive.
2. **The cross-term mastery gate holds.** Only builds high on **both** axes (Vampire Bruiser, Synergy God) push `D_thr` past the 1.4 soft-cap to the 1.8 ceiling. Every offense-only build is **mercy-eased to D_thr 0.6**; every defense-only build is **soft-capped at 1.4**. One global "difficulty" knob could never do this — the decoupling is the whole point and it works.
3. **Decoupling is clean:** Glass Nuke → `D_hp 3.0 / D_thr 0.6` (more to kill, no extra threat); Pure Tank → `D_hp 0.6 / D_thr 1.4` (real threat, not drowned in trash). Mercy (deaths ease threat) and escalation (full-HP fast clears bump count) both fire correctly. Cold-start holds waves 1–2.
4. **Divide-by-zero / clamp safety is solid** — `safeRatio` guards every divisor, clamps bound every step (the bug-pass found the director module itself clean).

### ⚠ Flaws & limits (with the numbers)

1. **BUG — per-wave rate-limit is breached (~+25%/wave vs documented ≤12%).** `updateDifficulty` applies `rateLimit` **per block** — the deadband step (+12%) and the escalation `stomp` bump (+12% on the already-raised value) **compound**, so a stomping build moves D_hp `1.0 → 1.25 → 1.57 …` (+25.4%/wave) and hits the ceiling in **~5 waves instead of ~10**. Mercy can likewise stack with the deadband ease. This is a real contract violation and a churn/whiplash source. **Fix:** snapshot D at function entry and clamp the *net* per-wave change to ±maxStep once at the end (or fold escalation/mercy into the single rate-limited step). *(Quick, high-value — improves the live director today; also subsumed by DIR-04.)*
2. **Oscillation under alternating performance.** Fed a true stomp/struggle square-wave, D_hp thrashes **1.33 peak-to-peak** — EMA(α0.4) + deadband damp *noisy-centered* input but not a genuine alternation (a real player who trades a great wave for a rough one every other wave). The §14 single-pressure control loop (one steer/wave against a mode band) is structurally calmer; until then, consider a slower α or a longer EMA window for stability.
3. **`D_thr` ceiling reachable by a "Vampire Bruiser," not just a true god.** Pd conflates raw tankiness+sustain with mastery, so a sustain-heavy bruiser (Po 3.18, Pd 2.23) clears the `Po>1.3 ∧ Pd>1.3` gate and gets max threat. Arguably correct (it *is* strong on both), but worth a deliberate tuning call — a pure-sustain build that isn't "skilled" still earns the hardest threat.
4. **Channel coverage is thin (2/10).** The intended "~35 s clear / ~60 % HP retained" channel is only hit by Balanced + Vampire Bruiser. The **298× build spread is simply wider than the current ceilings can compress**: a Synergy God clears wave-20 elites in **0.09 s**; even at the D_hp 3.0 ceiling (≈0.27 s) it's still a faceroll. This is *partly* intentional (Tuning §6.5: above ~3.5× let them feel god-like), but the current single lever (enemy HP ×, capped at 3) can't reach the middle of the spread — it needs density/count + threat working together.
5. **STRUCTURAL — the first-pass director is insufficient for strong builds & long runs** (this is the big one, and it's *by design* a first pass):
   - **No PWR pre-load** → the reactive-only director needs **~9.7 waves** to ramp a god build, i.e. nearly the entire 10-stage run. The build farms an un-escalated game until it's almost over.
   - **No absolute baseline curve** → D_hp hard-clamps at **3.0**, but §14.5's `baseline(wave)=1+0.15w+0.06w^1.5` wants **×9.4 by wave 20, ×65 by wave 90**. The current director **saturates** — a 99-card / 30-stage late game cannot be made lethal. The Starter-vs-target gap widens from ~4× (W3) to **15.6×** (W20).

### → Recommendation: the DIR §14 track is the fix, and the data proves it
The stress run **quantifies why** each new DIR task matters:
- **DIR-01 (PWR estimator)** + **DIR-05/07 (pre-load, reference-clear)** eliminate the ~9.7-wave ramp lag — a strong build pre-faces tougher enemies *immediately*.
- **DIR-02 (absolute baseline curve)** + **DIR-04/10 (enemyPower distributed across HP/dmg/density/count)** remove the saturation ceiling and give the headroom long runs need, *and* spread pressure beyond just-bigger-HP (avoiding the bullet-sponge anti-pattern the spread otherwise forces).
- **DIR-03/08/09 (mode)** lets the player opt into a harder band (Tuning's "tug the Director"), widening the channel the system can serve.
- **Quick win now:** fix the rate-limit breach (#1) independently — it's a clear bug in the live director.
- **For RUN-07:** the real K_PWR must be calibrated against the *actual* getters (the stress run used K_PWR=4.4612 against a *model*); and CD-17 telemetry should log Po/Pd/P/D per wave to tune every §14.6 constant against real play. Re-run these stress scripts after CD lands (player power changes drastically) and after DIR-04.

---

## Part 2 — Bug-pass audit (prioritized; full detail + fixes in the appendix)

**Counts: 0 Critical · 2 High · 2 Medium · 4 Low · 2 design-watch.** The 7 ability helpers, the director, reward-dial, cores/item math, and the boss chassis all reviewed **clean**; nearly every issue is at an integration seam.

| # | Sev | Bug | Fix (verified) |
|---|---|---|---|
| H1 | High | **PRISM_MIRROR reflect has no distance gate** (`reflect.js bulletInReflectArc` tests angle only; the maw sibling correctly gates `range`). A mirror reflects *any* player bullet anywhere on the field within its 120° arc — a huge difficulty spike on waves 23/28. | Add `range` to `REFLECT_DEFAULTS` + `PRISM_MIRROR.reflectOpts`; short-circuit `dist2 > range²` in `bulletInReflectArc` (mirror `bulletInMawCone`). Add a "far in-arc bullet NOT reflected" QA case. |
| H2 | High | **Custom run length (RUN-06) breaks bosses.** With `wavesPerStage≠3`, hard-coded `WAVE_DATA` boss entries are silently dropped (the `isBoss` branch `continue`s when `spawnStageBoss` returns null); past wave 30, `getWaveConfig` falls back to wave-1 content with no bosses. Only the experimental non-default runs; default 10×3 is fine. | Drive boss spawns off `isBossWave(wave, runWavesPerStage)` (not the per-entry flag) or fall back to `spawnLeveledEnemies` when `spawnStageBoss` returns null; synthesize `getWaveConfig` past wave 30. *(Largely overlaps RUN-05b composer.)* Interim: clamp RUN SETUP so `runMaxWaves ≤ 30`. |
| M1 | Med | **Boss-bonus gold uses default wps=3**, ignoring runConfig (`wave-manager.js:1804` — every other call threads `runWavesPerStage`). | `isBossWave(justCleared, runWavesPerStage(this.game))`. |
| M2 | Med | **Director Po spike if `_waveStartMs` unset** — `actualClearTime` clamps to 1 ms → huge dpsRatio → D_hp slams toward 3.0. Latent (normal flow sets the stamp). | Treat missing stamp as "no signal": skip the feed, or default `actualClearTime = targetClearTime` (neutral). |
| L3 | Low | `addPowerup` returns `undefined` on success (callers can't tell granted vs refused). | `return true;` on the success path. |
| L4 | Low | Reward-Dial Cores scaling never reaches salvage (`salvageValue` called with no `rewardMult` everywhere). | Thread `rewardMultiplier(game,wave)` into the armory salvage calls, or drop the param. |
| L5 | Low | `EnemyBullet.reset()` doesn't clear `reflected` (benign today — only player bullets are read — latent footgun). | Add `this.reflected = false;` to `reset()`. |
| L6 | Low | `partitionBulkSalvage` never offers items in an unequipped slot (likely intended — confirm). | Confirm UX; adjust if unintended. |
| D1 | watch | Director "hits-survived" mildly self-reinforces threat (more hits → higher Pd → more threat). Damped by mercy + EMA; a RUN-07 tuning watch-item. | — |
| D2 | watch | A sustained CHILL field can *permanently* disable WRAITHWORM's blink (`_frozenUntil` perpetually refreshed). Comment says intended; confirm it's a full lockout vs a stretch. | — |

---

## Part 3 — Recommended action order

1. **Quick fixes (low-risk, high-value, do first):** the director **rate-limit breach** (Part 1 #1), **H1** (reflect range), **M1** (boss gold wps), **L3/L5** (return/reset hygiene), **M2** (director stamp guard). All small, each its own PATCH + test.
2. **DIR §14 track** (Plans.md top) — the structural fix the stress data justifies. **Sequence:** DIR-01/02 (parallel foundation) → DIR-03/04 (control loop) → DIR-05–10 (wiring). This is the marquee remaining adaptive-difficulty work.
3. **H2 / RUN-06 boss path** — fold into **RUN-05b** (the procedural composer is the proper home for non-default run shapes + extended waves); interim-clamp stages ≤ 30 in RUN SETUP if shipping RUN-06 before the composer.
4. **CD no-downsides expansion** (P1 in Plans.md) — independently the biggest gameplay chunk; **changes player power drastically, so re-run the stress scripts + do RUN-07 calibration AFTER it lands.**
5. **L4/L6/D1/D2** — address during RUN-07 tuning.

> **Unimplemented-content check** (enemies/bosses/abilities/powerups): the entire enabling-systems layer (SYS-1..11) + all 10 bosses are live; remaining is *roster breadth* only — Conduit Node, Beacon, Juggernaut, Thornback, artillery/controllers (Plans P4: ENMY-08/09b/10b/11/12) and the elite-variant mechanic (ENMY-ELITE). Abilities/powerups remaining = the CD track (FIELD_PROJECTOR/Attune/new abilities, no-downsides passives/powerups). No *outlying untracked* feature was found.
