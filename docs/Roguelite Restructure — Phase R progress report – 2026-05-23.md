# Roguelite Restructure — Phase R Progress Report

作成日: 2026-05-23 · Autonomous /loop sprint against `Plans.md` Phase R (+ R1)

This report covers the work shipped this sprint, the concerns I want you to
review, and the recommended sequencing for the (substantial) remaining work.

---

## ✅ Shipped this sprint (committed to `master`)

### 6.84.0 — R1: terminology Skills → Abilities (pure rename)
- Renamed the entire 4-slot active-"skill" vocabulary to **abilities** across
  23 source files + tests + CSS (word-boundary `perl` rename). `SKILLS`→
  `ABILITIES` (alias retired), `SKILL_UPGRADES`→`ABILITY_UPGRADES`,
  `equippedSkills`/`skillCooldowns`/`activeSkill…` → `…Ability…`,
  `player/skills.js` → **`player/abilities.js`**, radial `'skill'`→`'ability'`,
  `data-tab` CSS hooks.
- **Deliberately left** `skillPoints` untouched — it's a *separate* legacy
  stat-point currency, not an active ability (handled in R7).
- **No behavior change.** Validated: 505/505 unit + QA 07-weapons 19/19.

### 6.85.0 — R2.1 / R2.2 / R2.3: gold economy + ARMORY pre-run flow
- **Two wallets.** Run-gold (`game.money`) starts at **0**, accrues from kills,
  **banks** into persistent **account-gold** at run end (idempotent). Account-gold
  lives in `rainboidsMeta.accountGold` (migrated from the pre-R2 `money` field).
- **ARMORY screen** (`ui/armory-overlay.js`): NEW GAME → ARMORY → run; post-run
  NEW GAME routes through it too; CONTINUE skips it. Spend account-gold on
  permanent weapon/ability **unlocks** (abilities priced higher).
- Pure economy core `shop/armory.js`; new `ARMORY`/`LOADOUT` states (LOADOUT
  reserved for R5).
- **R2.3:** retired `unlockWave` wave-milestone auto-unlocks. Owned pool is now
  base ∪ purchased unlocks, resolved once per run.
- Validated: 528 unit (+17 economy, +6 state-flow) + 40 QA (+9 armory) all green.

---

## ⚠️ Concerns / things to review

1. **R2.4 is intentionally NOT done.** Retiring the gold *upgrade-tree shop*
   depends on **R3 (cards)** existing to replace it (Plans.md marks R2.4
   `Depends: R3.1`). Until then the **old shop coexists** as a run-gold sink.
   This is a coherent transitional state, but it means there are currently
   *two* gold-spend surfaces (in-run shop on run-gold, Armory on account-gold).

2. **Transitional regression for existing players (by design).** Run-gold now
   starts at 0, so a previously-carried wallet moves to **account-gold** and is
   only spendable in the ARMORY (not the in-run shop). This matches the design
   doc, but it's a noticeable change for anyone with a saved profile.

3. **4 e2e tests skipped** (`tests/e2e/10-weapon-economy.spec.js`): the
   wave-unlock / unlock-notification tests assert behavior **deliberately
   removed** in R2.3. I skipped (didn't delete) them with inline reasons; the
   test-tamper hook flagged each — that's expected here. They need re-authoring
   for the new economy alongside R2.4/R3. The other 3 tests in that file
   (shop ramp, weapon stats) remain active.

4. **Machine-load test flakiness.** The first full QA run showed 14 "failures"
   that were purely load-induced timeouts (load avg ~60 at the time); the same
   tests pass in isolation. The deterministic **unit suite is the reliable
   gate**; treat full-suite QA flakes under load with suspicion, not as
   regressions. CI uses `retries:1`, local uses `retries:0`.

5. **`core/version.js` is stale** (`VERSION='6.45.1'` while `/VERSION` is at
   6.85.0). Its comment claims per-release sync but it has drifted ~40 versions.
   The title screen renders this tag. I left it untouched (out of scope) — worth
   a one-line fix if the in-game build tag matters.

6. **R7 (leveling→SP→Stats) is more tangled than the plan implies.** There are
   **two parallel systems**: the inert `experience`/`skillPoints`/
   `experienceToNextLevel` (no-op `gainExperience` since 6.0.0) and the *active*
   `sp`/`spStats` SP system (`sp-stats.js`, `sp-allocation.js`, `stats-overlay.js`,
   `allocateSp`). `savePersistentProfile` writes `level/xp/sp/spStats` but
   `applyPersistentProfile` does **not** restore them (save/load asymmetry).
   R7.1 ("reactivate leveling") must reconcile these two systems and fix the
   load path — it's not a quick toggle. Recommend a focused design pass.

7. **R8 (inventory-as-meta) has an ordering hazard.** R8.2 ("remove auto-equip")
   is **regressive on its own** — without R8.3 (the inventory-equip screen in
   the Armory), gear would never get equipped. R8.1/R8.2/R8.3 should land
   together. R8.5 (Cores + salvage) is pure logic and unit-testable in isolation
   (mirror `shop/armory.js`) but dormant until the salvage UI exists.

8. **`Plans.md` is over its 200-line soft cap** (245 lines; a hook flagged it).
   Consider `/maintenance` to archive the shipped ledger once the sprint settles.

---

## 🔭 Recommended sequencing for the rest of Phase R

The execution order (R8 → R6 → R5 → R3 → R4 → R7) is sound, with these notes:

- **R8 (next):** do R8.1+R8.2+R8.3 as one commit (persistent stash + no
  auto-equip + Armory inventory-equip screen) to avoid the regression. Then
  R8.5 (Cores logic, pure/testable) → R8.6–R8.9 (Cores sinks) + R8.4 (run-end
  reconciliation). The ARMORY screen built this sprint is the natural host for
  the inventory tab.
- **R6 (abilities):** R6.1 (cut Tractor Shield, consolidate the two heals into
  Field Medic) touches spread-out consumers (`collision-system`,
  `weapon-effects-renderer`, `abilities.js`, `ABILITY_UPGRADES`) — budget for
  careful test updates. R6.3 (new ability batch) is large; gate each new ability
  on a live consumer.
- **R5 (loadout screen):** slot the `LOADOUT` state (already reserved + wired in
  the transition table) between ARMORY and the run; replace `_rollRandomLoadout`
  with the chosen 4+4+4 picker reading the unlocked pool.
- **R3 then R2.4:** build the card draft (repurpose `#wave-pick-overlay`), then
  retire the gold upgrade-tree shop and re-author the skipped e2e economy tests.
- **R7 last:** reconcile the two leveling systems first (concern #6).

---

## Validation summary
- **Unit:** 528/528 green (`npm run test:unit`).
- **QA (isolation, load normal):** 01-load 13/13, 07-weapons 19/19,
  08-armory 9/9 — full boot + armory flow + banking + rename all verified.
- **e2e:** not run (slow + 4 obsolete tests skipped pending economy rewrite).
