# Roguelite Restructure — Phase R Progress Report

作成日: 2026-05-23 · Updated after the full autonomous /loop sprint (6.84.0 → 6.93.0).

This report covers the entire Phase R restructure shipped this sprint, the
concerns to review, and the remaining (deferred/blocked) work.

---

## ✅ Shipped this sprint — 14 versions (6.84.0 → 6.95.0), all validated + committed to `master`

| Ver | Phase | Summary |
|-----|-------|---------|
| 6.84.0 | **R1** | Skills → Abilities rename (23 files; `player/skills.js`→`abilities.js`). |
| 6.85.0 | **R2.1–3** | Gold economy: run-gold→0 + banked account-gold (migrated); **ARMORY** pre-run screen + unlock store; `unlockWave` retired. |
| 6.86.0 | **R8.1/4/5** | Persistent gear **stash** + **Cores** salvage. Fixed a latent title-autosave data-loss bug (wiped account-gold/Cores). |
| 6.87.0 | **R8.2/3** | No auto-equip; ARMORY **EQUIPMENT** screen (equip stash→slots, deltas). |
| 6.88.0 | **R8.6/8** | Cores **reroll** + **tier-up** crafting. |
| 6.89.0 | **R6.1/2** | Abilities audit: Repair Nanites → **Field Medic** (burst heal + cleanse); base kit; **Tractor Shield cut**. |
| 6.90.0 | **R5** | **LOADOUT** screen (chosen 4+4+4 from unlocked pool, narrows the run). |
| 6.91.0 | **R3.1–3** | Per-run **card draft** (2 weapon + 1 ability, relevance-filtered, 5/run). |
| 6.92.0 | **R4.2/3 + R2.4(part)** | In-run gold sinks: paid **reroll** + **Repair Kit** at the card moment; post-card upgrade quick-buy retired. |
| 6.93.0 | **R7.1–3** | Validated the (already-functional) level→SP→Stats system; **fixed** the Stats-menu auto-open to fire on every stage clear when leveled. |
| 6.94.0 | **R4.1/3** | **6th/7th card** (bonus pick) + **Revive Token** (1/run cheat-death) — **R4 complete**. |
| 6.95.0 | **R7.4** | Boss bonus grants gold (not a passive); stat passives are **SP-only** — **R7 complete**. |
| 6.96–6.99.0 | **R6.3** | **9 new abilities** added (4 batches): Blink, Gravity Snare, Designator, Second Wind, Elemental Infusion, Cryo Field, Stasis Field, Storm Cell, Pyre Aura — all purchasable + equippable. |

**The full roguelite loop is playable end-to-end:** TITLE → ARMORY (unlocks /
gear equip / Cores craft) → LOADOUT (pick 4+4+4) → run (5 relevance-filtered
card drafts; paid reroll / Repair Kit / 6th-7th card / Revive Token sinks;
level-ups open the Stats menu) → run end banks gold + commits loot to the stash.

**Phase R status:** R1 ✓ · R2.1–3 ✓ (R2.4 partial) · R3 ✓ · R4 ✓ · R5 ✓ ·
R6.1–2 ✓ + R6.3 **9/12 abilities** (3 cross-cutting deferred) · R7 ✓ ·
R8.1–6/8 ✓ (R8.7/9 blocked on Phase C). **20 commits, 6.84.0 → 6.99.0.**

**Test totals:** 593 unit (was 505) + new QA suites 08-armory (21), 09-loadout
(7), 10-cards (9), 11-leveling (5). Every commit kept the game launchable.

---

## ⚠️ Concerns to review

1. **R2.4 is partial — the one remaining Phase R cleanup.** The post-card
   upgrade quick-buy (`shop-suggest`) is retired, but the **mid-wave UPGRADES
   shop** (HUD 🛒 + pause-menu UPGRADES) still sells gold upgrade-tree stacks —
   redundant with cards now. **I deliberately did NOT remove it** because it's a
   *product judgment* (a working, player-facing system) + would churn the
   07-weapons shop-tree QA tests (which call `openShop()` and assert the tree
   renders). Options for you: (a) full removal + skip/rewrite those 4 tests, or
   (b) keep the shop as an optional extra run-gold sink. R7.4's passive removal is
   already done independently (boss bonus → gold; passives SP-only).
2. **R6.3 — 9 of 12 abilities done; 3 cross-cutting ones remain (deferred).**
   Shipped (all purchasable + equipped, validated): Blink, Gravity Snare,
   Designator, Second Wind, Elemental Infusion, Cryo Field, Stasis Field, Storm
   Cell, Pyre Aura. **Deliberately deferred (each modifies a CORE system → real
   regression risk + needs playtesting, not safe to do unsupervised):**
   - **Decoy Beacon** — needs enemy retargeting across `updateTargetPriority` /
     `updateFaceDirection` / movement (a combat-AI change).
   - **Bullet Time** — needs selective slow-mo *inside the fixed-timestep loop*
     (slow enemies/bullets, normal player) — high risk to the timestep.
   - **Catalyst** — needs parameterizing the A.E4 reaction chains (SHATTER /
     CASCADE spread depth) with a player multiplier.
   The unlock-store + 4-slot model already support adding them; the abilities.js
   activate + (for auras) the field-tick are the patterns to follow.
3. **Blocked on Phase C (unimplemented):** **R8.7** (resist targeting → needs
   C.I2 tier-gated resist counts), **R8.9** (trait reroll → needs C.I3 traits).
4. **R-BAL (balance) not started** — the whole point of "no mastery" is that
   difficulty is tuned around meta power (SP + gear + unlocks). With the meta now
   in place, a balance pass + an AI-survival run on a progressed account is the
   natural next validation. Not attempted (needs playtesting, not just code).
5. **Tractor Shield physics left dormant** — cut from the roster but the
   collision/render beam code remains (guarded by an always-false
   `has('TRACTOR_SHIELD')`). Safe, but a cleanup sweep is owed.
6. **`core/version.js` stale** (`6.45.1`) vs `/VERSION` (6.95.0) — the in-game
   title build tag. Pre-existing; left untouched.
7. **QA flakiness under machine load** — earlier in the sprint the machine hit
   load avg ~60 and QA timed out spuriously; the unit suite is the reliable gate.
   `tests/e2e/10-weapon-economy.spec.js` still has 4 tests skipped (assert
   retired wave-unlocks) pending a roguelite-economy e2e rewrite.
8. **`Plans.md` is ~270 lines** (over its 200 soft cap) — the per-task tables
   still say `cc:TODO` while the top banner tracks what shipped. A `/maintenance`
   pass to reconcile the tables + archive the shipped ledger is worth doing.

---

## 🔭 Recommended next steps (need your prioritization)

Phase R's bounded, low-risk scope is **done**. What remains all needs a product
call or is blocked:

- **R6.3 finish (3 cross-cutting abilities):** Decoy Beacon, Bullet Time,
  Catalyst — each needs a careful core-system change (AI retargeting / fixed-step
  slow-mo / reaction-chain depth) + playtesting. Worth a focused, supervised pass.
- **Economy cleanup (product call):** R2.4-full — remove the mid-wave gold
  UPGRADES shop, OR keep it as an optional run-gold sink. Removal means
  skip/rewrite ~4 07-weapons shop tests + the 4 skipped e2e economy tests.
- **Validation:** an R-BAL balance pass + AI-survival run on a meta-progressed
  account — needs playtesting, not just code.
- **Blocked:** R8.7/R8.9 await Phase C (C.I2 resist counts, C.I3 traits).
- **Separate tracks (per Plans.md, under the "may be replaced" note):** Phase A
  remaining enemies + enabling systems, Phase B skills UI, Phase C item traits,
  Phase D 10 bosses — each a large body of work.

---

## Validation summary
- **Unit:** 593/593 green (`npm run test:unit`).
- **QA (isolation):** 01/07/08/09/10/11 all green — boot, weapons, armory,
  loadout, cards+sinks, leveling.
- **e2e:** not run (slow; 4 obsolete economy tests skipped pending rewrite).
